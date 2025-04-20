import torch
import open_clip
import time
import glob
import sqlite3
import tqdm
import os
import re
import numpy as np
from PIL import Image


class FrameSearch:
    def __init__(self, database_path='data/frame_embeddings.db'):
        if torch.cuda.is_available():
            self.device = torch.device('cuda')
        elif torch.backends.mps.is_available():
            self.device = torch.device('mps')
        else:
            self.device = torch.device('cpu')
        print(f"Using device: {self.device}")

        # key is the frame number and the value is the embedding
        self.data_dict = {}
        self.existing_frames = set() # Keep track of frame IDs loaded or processed
        self.database_path = database_path
        
        # Ensure data directory exists
        os.makedirs(os.path.dirname(self.database_path), exist_ok=True)

        self.load_model()
        self.init_db() # Now loads existing embeddings

    def load_model(self):
        start_time = time.time()
        print("loading model...")
        self.model, _, self.preprocess = open_clip.create_model_and_transforms('ViT-SO400M-14-SigLIP-384', pretrained='webli', device=self.device)
        # Initialize the tokenizer
        self.tokenizer = open_clip.get_tokenizer('ViT-SO400M-14-SigLIP-384')
        print("model loaded in %0.2f seconds" % (time.time() - start_time))

    # New method to embed text
    def embed_string(self, query=''):
        start_time = time.time()
        text = self.tokenizer([query]).to(self.device)
        text_embedding = None
        with torch.no_grad(), torch.cuda.amp.autocast():
            text_embedding = self.model.encode_text(text).float()
            text_embedding /= text_embedding.norm(dim=-1, keepdim=True)
        # print(f"encoded text '{query}' in {time.time() - start_time:.2f} seconds") # Optional: uncomment for timing info
        return text_embedding.cpu().numpy()[0]

    def embed_image(self, filepath):
        start_time = time.time()
        try:
            image = Image.open(filepath)
            converted_image = self.preprocess(image.convert("RGB"))
        except Exception as e:
            print(f'error opening {filepath}: {e}')
            return None

        with torch.no_grad(), torch.cuda.amp.autocast():
            tensor_image = torch.stack([converted_image.to(self.device)])
            embedding = self.model.encode_image(tensor_image).float()
            # normalize
            embedding /= embedding.norm(dim=-1, keepdim=True)

        # Return as float32 numpy array
        return embedding.cpu().numpy().astype(np.float32)[0]

    def get_frame_number(self, filename):
        # Extract frame number from filename like "frame_000001.jpg"
        match = re.search(r'frame_(\d+)\.', filename)
        if match:
            return int(match.group(1))
        return None

    def init_db(self):
        conn = sqlite3.connect(self.database_path)
        c = conn.cursor()
        # Create table with frame_id as integer primary key
        c.execute('CREATE TABLE IF NOT EXISTS frames (frame_id INTEGER PRIMARY KEY, raw_data BLOB)')

        # Load existing frame IDs and embeddings from the database into memory
        c.execute('SELECT frame_id, raw_data FROM frames')
        rows = c.fetchall()
        self.existing_frames = set()
        self.data_dict = {} # Clear dict before loading
        print(f'Loading {len(rows)} existing frames from database...')
        if rows:
            for row in tqdm.tqdm(rows):
                frame_id = row[0]
                try:
                    # Assuming embeddings are stored as float32
                    embedding = np.frombuffer(row[1], dtype=np.float32)
                    self.data_dict[frame_id] = embedding
                    self.existing_frames.add(frame_id)
                except Exception as e:
                    print(f"Error loading embedding for frame {frame_id}: {e}")
        print(f'Loaded {len(self.data_dict)} frames into memory.')
        
        conn.commit()
        conn.close()

    def process_frames(self, directory='data/raw_images'):
        # Get all image files in the directory
        glob_files = glob.glob(f'{directory}/*.jpg')
        
        print(f'Found {len(glob_files)} image files in {directory}')
        
        new_frames_to_db = [] # Renamed to avoid confusion with existing frames
        
        # Process each file
        for filepath in tqdm.tqdm(glob_files):
            filename = os.path.basename(filepath)
            frame_id = self.get_frame_number(filename)
            
            if frame_id is None:
                print(f"Couldn't extract frame number from {filename}, skipping")
                continue
                
            # Skip if already in database
            if frame_id in self.existing_frames:
                continue
                
            # Embed the image
            embedding = self.embed_image(filepath)
            if embedding is not None:
                # Add to in-memory dict and list for DB insertion
                self.data_dict[frame_id] = embedding
                new_frames_to_db.append((frame_id, embedding.tobytes()))
                self.existing_frames.add(frame_id) # Track newly added frames
        
        print(f'Processed {len(new_frames_to_db)} new frames')
        
        # Save to database
        if new_frames_to_db:
            conn = sqlite3.connect(self.database_path)
            c = conn.cursor()
            c.executemany('INSERT INTO frames VALUES (?, ?)', new_frames_to_db)
            conn.commit()
            conn.close()
            print(f'Saved {len(new_frames_to_db)} new frames to database')

    # New method to search frames based on text query
    def search_frames(self, term, show_top=10):
        print(f"Searching for '{term}'...")
        if not self.data_dict:
            print("No frame embeddings loaded. Process frames first or ensure DB is populated.")
            return []

        text_embedding = self.embed_string(term)
        
        # Pre-calculate the norm of the text embedding for efficiency
        norm_a = np.linalg.norm(text_embedding)
        if norm_a == 0:
            print("Warning: Text embedding norm is zero. Cannot compute similarity.")
            return []

        similarities = {}
        start_time = time.time()
        
        # Iterate through loaded image embeddings
        for frame_id, image_embedding in self.data_dict.items():
            if not isinstance(image_embedding, np.ndarray):
                 print(f"Warning: Embedding for frame {frame_id} is not a numpy array, skipping.")
                 continue
            
            # Calculate cosine similarity
            dot_product = np.dot(text_embedding, image_embedding)
            norm_b = np.linalg.norm(image_embedding)
            
            # Avoid division by zero
            if norm_b == 0:
                cosine_similarity = 0.0
            else:
                # Ensure calculation is done in float64 for precision, though inputs are float32
                cosine_similarity = dot_product / (norm_a * norm_b)

            similarities[frame_id] = cosine_similarity

        # Sort by similarity descending
        # Use item[1] for similarity score
        sorted_similarities = sorted(similarities.items(), key=lambda item: item[1], reverse=True) 
        print(f"Search completed in {time.time() - start_time:.2f} seconds.")

        # Get the top N results
        top_results = sorted_similarities[:show_top]

        print(f"Top {min(show_top, len(top_results))} results for '{term}':")
        if not top_results:
             print("No similar frames found.")
        else:
            print("Rank	Similarity	Frame ID")
            print("----	----------	--------")
            for i, (frame_id, similarity) in enumerate(top_results):
                print(f"{i + 1}	{similarity:.4f}		{frame_id}")

        return top_results

if __name__ == "__main__":
    embedder = FrameSearch()
    
    # Check if frames need processing or if DB is empty
    if not embedder.data_dict:
        print("No embeddings found in memory/DB.")
        print("Please run process_frames() first if the database is empty or needs updating.")
    else:
        print(f"Loaded {len(embedder.data_dict)} embeddings. Ready to search.")
        
        # Interactive search
        try:
            while True:
                query = input("Enter search query (or press Ctrl+C to exit): ")
                if query:
                    embedder.search_frames(query, show_top=10)
        except KeyboardInterrupt:
            print("Exiting search.")

    # Optional: Process frames if needed (e.g., on first run or to add new ones)
    # embedder.process_frames()

    # Example Usage:
    # results = embedder.search_frames("a picture of a cat")
    # results = embedder.search_frames("someone walking on a street")
    # You can add more search examples here or allow user input

    embedder.process_frames() 