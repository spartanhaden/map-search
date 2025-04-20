#!/usr/bin/env python3

import time
import os
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# Assuming frame_search.py is in the same directory or accessible in PYTHONPATH
from frame_search import FrameSearch

# Configuration
STATIC_DIR = "static"
FRAMES_DIR = "data/frames"
FRAME_FILENAME_FORMAT = "frame_{:06d}.jpg" # Assumed format like frame_000001.jpg
FAVICON_PATH = os.path.join(STATIC_DIR, 'assets/favicon.png') # Assumed path
DEFAULT_HTML = os.path.join(STATIC_DIR, 'index.html')
NOT_FOUND_HTML = os.path.join(STATIC_DIR, '404.html') # Optional: Path to a custom 404 page

# --- Initialization ---

# Ensure static directory exists
os.makedirs(STATIC_DIR, exist_ok=True)
# Ensure frames directory exists (server doesn't create frames, but checks existence)
# os.makedirs(FRAMES_DIR, exist_ok=True) # Uncomment if needed, but usually FrameSearch handles data dir

print("Initializing FrameSearch...")
start_time = time.time()
# Instantiate FrameSearch - this will load the model and embeddings
frame_search_instance = FrameSearch()
print(f"FrameSearch initialized in {time.time() - start_time:.2f} seconds.")

if not frame_search_instance.data_dict:
    print("Warning: No frame embeddings loaded. Search might not work until frames are processed.")
    print("You may need to run frame_search.py script's process_frames() first.")
else:
    print(f"Loaded {len(frame_search_instance.data_dict)} embeddings. Ready for search.")


app = FastAPI()

# Mount static files directory
if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    print(f"Mounted static directory: {STATIC_DIR}")
else:
    print(f"Warning: Static directory '{STATIC_DIR}' not found.")

# --- Helper Functions ---

def get_frame_search_singleton():
    """Dependency function to get the global FrameSearch instance."""
    return frame_search_instance

def get_frame_filepath(frame_id: int) -> str:
    """Constructs the expected filepath for a given frame ID."""
    filename = FRAME_FILENAME_FORMAT.format(frame_id)
    return os.path.join(FRAMES_DIR, filename)

# --- API Endpoints ---

@app.get("/")
async def read_root():
    """Serves the main index.html page."""
    if os.path.exists(DEFAULT_HTML):
        return FileResponse(DEFAULT_HTML)
    else:
        return JSONResponse(content={"error": f"{DEFAULT_HTML} not found"}, status_code=404)

@app.get("/search")
async def search_frames_api(
    request: Request,
    frame_search: FrameSearch = Depends(get_frame_search_singleton)
):
    """
    Searches for frames based on a text query.
    Expects a 'term' query parameter.
    Returns a JSON list of matching frame IDs.
    """
    term = request.query_params.get('term', '')
    if not term:
        raise HTTPException(status_code=400, detail="Missing 'term' query parameter")

    print(f"Received search request for: '{term}'")
    start_time = time.time()

    # Use the search_frames method which returns [(frame_id, score), ...]
    results = frame_search.search_frames(term, show_top=50) # Get top 50 results
    frame_ids = [frame_id for frame_id, score in results] # Extract just the IDs

    print(f"Search for '{term}' completed in {time.time() - start_time:.2f} seconds, found {len(frame_ids)} results.")

    return JSONResponse(content={"frame_ids": frame_ids})


@app.get("/frame/{frame_id}")
async def serve_frame(frame_id: int):
    """Serves the image file for the requested frame ID."""
    try:
        filepath = get_frame_filepath(frame_id)
        print(f"Request for frame {frame_id}, checking path: {filepath}")

        if os.path.exists(filepath):
            return FileResponse(filepath)
        else:
            print(f"Frame image not found: {filepath}")
            # Optionally serve a custom 404 HTML page
            if os.path.exists(NOT_FOUND_HTML):
                 return FileResponse(NOT_FOUND_HTML, status_code=404)
            raise HTTPException(status_code=404, detail=f"Frame {frame_id} not found at {filepath}")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid frame ID format")
    except Exception as e:
        print(f"Error serving frame {frame_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Serves the favicon."""
    if os.path.exists(FAVICON_PATH):
        return FileResponse(FAVICON_PATH)
    else:
        # Return 204 No Content if favicon doesn't exist
        return Response(status_code=204)


if __name__ == "__main__":
    print("Starting Uvicorn server...")
    uvicorn.run(app, host="127.0.0.1", port=6841)
    print("Server stopped.") 