# Map Search

This project provides a web interface to search through video frames using natural language queries and visualizes the corresponding camera poses within a 3D point cloud reconstruction.

![Map Search Application Screenshot](example.png)

## Features

*   **Semantic Frame Search:** Enter text queries (e.g., "a person walking", "a red car") to find relevant video frames.
*   **3D Visualization:** View the camera poses (as frustums) overlaid on a 3D point cloud map (`sparse_map.ply`).
*   **Interactive Highlighting:** Search results highlight corresponding camera frustums in the 3D view. Hovering over result images also highlights the frustum.
*   **Dark Mode:** Toggle between light and dark themes.

## Setup

1.  **Prerequisites:**
    *   Python 3.x
    *   `pip` (Python package installer)

2.  **Clone the repository (if you haven't already):**
    ```bash
    git clone <your-repo-url>
    cd map-search
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Data:**
    *   Place your 3D point cloud file as `data/sparse_map.ply`.
    *   Place your frame pose data (COLMAP format expected) as `data/frame_poses.json`.
    *   Place the corresponding video frames (e.g., `frame_000001.jpg`) in `data/frames/`.

5.  **Process Frames (First time or when adding new frames):**
    The application uses pre-computed image embeddings for fast searching. You need to generate these embeddings the first time or if you add new frames.
    *   Ensure your raw frame images are located in a directory (e.g., `data/raw_images/`). The default location expected by the script is `data/raw_images`, but you can modify `frame_search.py` if needed.
    *   Run the embedding script. Uncomment the `embedder.process_frames()` line at the *end* of `frame_search.py` and run:
        ```bash
        python frame_search.py
        ```
    *   This will create/update `data/frame_embeddings.db`. You can comment out the `process_frames` call again after it's done.

## Running the Application

1.  **Start the server:**
    ```bash
    python server.py
    ```

2.  **Access the web interface:**
    Open your web browser and navigate to `http://127.0.0.1:6841` (or the address provided by `uvicorn`).

## Usage

*   **Search:** Type your query into the search bar at the top. Results will appear on the right, and corresponding camera frustums in the 3D view on the left will be highlighted (colored from grey to red based on similarity). Non-matching frustums will be hidden.
*   **Navigate 3D View:** Use your mouse to rotate (left-click drag), pan (right-click drag), and zoom (scroll wheel) the point cloud.
*   **Highlight:** Hover over an image result to highlight its corresponding frustum in green in the 3D view.
*   **Dark Mode:** Click the "Dark Mode" button to toggle the theme. 
