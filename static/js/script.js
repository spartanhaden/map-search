// Get the search input field
var searchInput = document.getElementById('search');

// Automatically focus the search bar when the page loads
searchInput.focus();

// --- Debounce Function ---
// Simple debounce function to limit the rate at which a function can fire.
function debounce(func, wait, immediate) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        var later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};

// --- Global Variables ---
let frustumMap = {}; // To store frustum objects keyed by frame ID
const DEFAULT_FRUSTUM_SCALE = 0.05; // Default size of the frustum pyramid

// --- Search Logic ---
function performSearch(searchTerm) {
    // Trim the search term and check if it's empty
    const trimmedTerm = searchTerm.trim();
    var imageContainer = document.getElementById('imageContainer'); // Get container here

    // If the search term is empty after trimming, clear results and reset frustums
    if (!trimmedTerm) {
        imageContainer.innerHTML = ''; // Clear previous results
        // Reset all frustums to default visible state
        Object.values(frustumMap).forEach(frustum => {
            frustum.visible = true;
            if (frustum.material.color) { // Check if material and color exist
                 frustum.material.color.setHex(0x888888); // Reset to default color (grey)
            }
        });
        return; // Stop execution
    }

    console.log('Debounced search triggered for:', trimmedTerm); // Log the search term

    // Send a GET request to the /search endpoint on the server
    fetch('/search?term=' + encodeURIComponent(trimmedTerm))
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            // Check if the data has the expected 'results' property (now contains [id, score] pairs)
            if (!data || !Array.isArray(data.results)) {
                console.error('Invalid data format received from server (expected {results: [[id, score],...]}): ', data);
                throw new Error('Invalid data format received from server.');
            }

            // Create a map of frameId -> score for efficient lookup
            const resultMap = new Map(data.results.map(([id, score]) => [String(id), score])); // Ensure keys are strings

            // Find the maximum score for normalization
            let maxScore = 0;
            if (data.results.length > 0) {
                // Scores might be negative or small, find the actual max
                maxScore = Math.max(...data.results.map(([, score]) => score)); 
                // Handle cases where maxScore could be 0 or negative if all scores are <= 0
                if (maxScore <= 0) {
                     maxScore = 1e-6; // Prevent division by zero/negative issues, use a small positive number
                }
            }

            const defaultColor = new THREE.Color(0x888888); // Grey
            const highlightColor = new THREE.Color(0xff0000); // Red

            // Update frustum visibility and color based on search results
            console.log("Updating frustums. Result Map:", resultMap);
            console.log("Frustum Map Keys:", Object.keys(frustumMap));
            console.log("Max Score:", maxScore);

            Object.entries(frustumMap).forEach(([frameId, frustum]) => {
                const frameIdStr = String(frameId); // Ensure key is string for lookup
                const score = resultMap.get(frameIdStr);
                // console.log(`Checking frustum ID (string): ${frameIdStr}`); // Optional: log every ID check

                if (score !== undefined) {
                    console.log(`Match found for frameId: ${frameIdStr}, Score: ${score}`); // Log matches
                    frustum.visible = true;
                    if (frustum.material && frustum.material.color) {
                         // Normalize score (ensure it's 0 to 1)
                        let normalizedScore = maxScore > 0 ? Math.max(0, Math.min(1, score / maxScore)) : 0;
                        console.log(`  Normalized Score: ${normalizedScore}`); // Log normalized score
                        
                        // Interpolate color from grey to red
                        const interpolatedColor = defaultColor.clone().lerp(highlightColor, normalizedScore);
                        console.log(`  Interpolated Color:`, interpolatedColor); // Log calculated color
                        frustum.material.color.copy(interpolatedColor);
                        // Optional: Adjust opacity based on score too?
                        // frustum.material.opacity = 0.5 + normalizedScore * 0.5; // Example: Range from 0.5 to 1.0
                        // if using opacity, ensure material has transparent: true
                    }
                } else {
                    frustum.visible = false;
                    // Optional: Reset color to grey even when hidden?
                    if (frustum.material && frustum.material.color) {
                        frustum.material.color.copy(defaultColor);
                    }
                }
            });

            // Remove any previously displayed images
            imageContainer.innerHTML = ''; // Clear previous results efficiently

            // For each frame ID in the results (use data.results which has [id, score])
            data.results.forEach(([frameId, score]) => { // Destructure to get frameId
                // Create a new div element with class 'card'
                var card = document.createElement('div');
                card.className = 'card';
                card.dataset.frameId = frameId; // Store frame ID on the card

                // Create a new img element
                var img = document.createElement('img');

                // Set the src attribute of the img element to the frame endpoint
                img.src = `/frame/${frameId}`;

                // Set the title attribute to the frame ID for the tooltip
                img.title = `Frame ID: ${frameId}`;

                // Add an error handler for images that fail to load
                img.onerror = function() {
                    console.error('Error loading image:', img.src);
                    card.innerHTML = `Frame ${frameId} (Error loading)`; // Optionally display an error in the card
                };

                // Add the img element to the 'card'
                card.appendChild(img);

                // Add the 'card' to the imageContainer
                imageContainer.appendChild(card);
            });
        })
        .catch(error => {
            console.error('Error fetching or processing search results:', error);
            // Optionally display an error message to the user in the UI
            imageContainer.innerHTML = `<p style="color: red;">Error during search: ${error.message}</p>`;
        });
}

// --- Event Listener for Search Input ---
// Create a debounced version of the search function
const debouncedSearch = debounce(performSearch, 100); // 300ms delay

// Add an event listener to the search input for the 'input' event
searchInput.addEventListener('input', function() {
    // Call the debounced search function with the current input value
    debouncedSearch(searchInput.value);
});

// --- Event Listeners for Image Hover Highlighting ---
const imageContainer = document.getElementById('imageContainer');
const highlightColor = new THREE.Color(0x00ff00); // Green

imageContainer.addEventListener('mouseover', (event) => {
    const card = event.target.closest('.card');
    if (card && card.dataset.frameId) {
        const frameId = card.dataset.frameId;
        const frustum = frustumMap[String(frameId)]; // Ensure string key
        if (frustum && frustum.material && frustum.material.color) {
            // Store original color only if not already highlighted green
            if (!card.dataset.originalColor) {
                 card.dataset.originalColor = '#' + frustum.material.color.getHexString();
            }
            frustum.material.color.copy(highlightColor);
        }
    }
});

imageContainer.addEventListener('mouseout', (event) => {
    const card = event.target.closest('.card');
    if (card && card.dataset.frameId && card.dataset.originalColor) {
        const frameId = card.dataset.frameId;
        const frustum = frustumMap[String(frameId)]; // Ensure string key
        if (frustum && frustum.material && frustum.material.color) {
            // Restore the original color
            frustum.material.color.set(card.dataset.originalColor);
        }
        // Remove the stored color attribute once restored
        delete card.dataset.originalColor;
    }
});

/* // --- Old Submit Event Listener (Removed) ---
document.getElementById('searchForm').addEventListener('submit', function(event) {
    // Prevent the form from being submitted in the standard way
    event.preventDefault();

    // Get the value from the search input field
    var searchTerm = searchInput.value;

    // Call the search logic directly (now handled by input listener)
    // performSearch(searchTerm); // Example if you were reusing the function here
});
*/

// Three.js Point Cloud Viewer
let scene, camera, renderer, controls;
let mapGroup; // Group to hold the map elements for rotation

function initPointCloud() {
    const container = document.getElementById('pointCloudContainer');
    if (!container) {
        console.error('Point cloud container not found.');
        return;
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('background-color')); // Match body background

    // Group for map elements
    mapGroup = new THREE.Group();
    mapGroup.rotation.x = Math.PI; // Rotate the entire map content 180 degrees
    scene.add(mapGroup);

    // Camera
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 5); // Adjust starting position as needed

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 500;
    // controls.maxPolarAngle = Math.PI / 2; // Optional: limit vertical rotation

    // Lighting (optional, but good for some materials)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Load and draw frustums BEFORE loading point cloud, so they appear underneath
    loadAndDrawFrustums();

    // PLY Loader
    const loader = new THREE.PLYLoader();
    loader.load(
        '/pointcloud', // The endpoint we created in server.py
        function (geometry) {
            geometry.computeVertexNormals(); // Optional: Compute normals if needed for lighting
            const material = new THREE.PointsMaterial({ 
                color: 0xaaaaaa, 
                size: 0.02, // Adjust point size
                vertexColors: geometry.hasAttribute('color') // Use vertex colors if present in PLY
            }); 
            const points = new THREE.Points(geometry, material);
            
            // Optional: Center the point cloud
            geometry.computeBoundingBox();
            const center = new THREE.Vector3();
            geometry.boundingBox.getCenter(center);
            points.position.sub(center);

            mapGroup.add(points); // Add points to the group instead of the scene
            console.log('Point cloud loaded successfully.');
        },
        // onProgress callback (optional)
        function (xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        // onError callback
        function (error) {
            console.error('An error happened during PLY loading:', error);
            container.innerHTML = '<p style="color: red;">Error loading point cloud.</p>'; // Show error in container
        }
    );

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Start animation loop
    animate();
}

function loadAndDrawFrustums() {
    // Camera intrinsics from user input
    const intrinsics = {
        f: 3093.4266, // Focal length
        cx: 1920,     // Principal point x
        cy: 1080,     // Principal point y
        W: 3840,      // Image width
        H: 2160       // Image height
    };
    const frustumScale = 0.05; // Controls the visual size of the frustum pyramid

    // Define the 5 points of the frustum in camera coordinates (origin + 4 corners at z=1 for base scaling)
    const cameraFrustumPoints = [
        new THREE.Vector3(0, 0, 0), // Camera Center (Origin)
        new THREE.Vector3(((0 - intrinsics.cx) / intrinsics.f) * 1, ((0 - intrinsics.cy) / intrinsics.f) * 1, 1), // Top-Left @ z=1
        new THREE.Vector3(((intrinsics.W - intrinsics.cx) / intrinsics.f) * 1, ((0 - intrinsics.cy) / intrinsics.f) * 1, 1), // Top-Right @ z=1
        new THREE.Vector3(((intrinsics.W - intrinsics.cx) / intrinsics.f) * 1, ((intrinsics.H - intrinsics.cy) / intrinsics.f) * 1, 1), // Bottom-Right @ z=1
        new THREE.Vector3(((0 - intrinsics.cx) / intrinsics.f) * 1, ((intrinsics.H - intrinsics.cy) / intrinsics.f) * 1, 1) // Bottom-Left @ z=1
    ];

    // Indices for the lines of the frustum (pyramid edges + base rectangle)
    const frustumLineIndices = [
        0, 1, 0, 2, 0, 3, 0, 4, // Edges from origin to corners
        1, 2, 2, 3, 3, 4, 4, 1  // Base rectangle
    ];

    fetch('/frame_poses')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok for frame poses: ' + response.statusText);
            }
            return response.json();
        })
        .then(posesData => {
            console.log(`Loaded ${posesData.length} frame poses.`);
            // const frustumMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 }); // Old: Shared material

            posesData.forEach(pose => {
                // Use pose.image_id directly as we know it's the correct key
                const frameId = pose.image_id; 

                // Basic check if image_id is missing for some reason
                if (frameId === undefined) {
                    console.error("Pose object missing expected 'image_id' property:", pose);
                    return; // Skip this pose if no ID
                }

                // COLMAP provides world-to-camera transform (qvec_world_to_cam, tvec_world_to_cam)
                // We need camera-to-world for rendering objects in world space.
                // Invert the transformation:
                // q_cam_to_world = q_world_to_cam.inverse()
                // t_cam_to_world = - (RotationMatrix(q_cam_to_world) * t_world_to_cam)

                const q_world_to_cam = new THREE.Quaternion(
                    pose.qvec_world_to_cam[1], // x
                    pose.qvec_world_to_cam[2], // y
                    pose.qvec_world_to_cam[3], // z
                    pose.qvec_world_to_cam[0]  // w - THREE.js uses (x, y, z, w)
                );
                const t_world_to_cam = new THREE.Vector3(
                    pose.tvec_world_to_cam[0],
                    pose.tvec_world_to_cam[1],
                    pose.tvec_world_to_cam[2]
                );

                // Invert quaternion
                const q_cam_to_world = q_world_to_cam.clone().invert();

                // Calculate rotation matrix from inverted quaternion
                const R_cam_to_world = new THREE.Matrix4().makeRotationFromQuaternion(q_cam_to_world);

                // Calculate inverted translation
                const t_cam_to_world = t_world_to_cam.clone().applyMatrix4(R_cam_to_world).multiplyScalar(-1);


                // Create the combined transformation matrix (camera-to-world)
                const transformMatrix = new THREE.Matrix4();
                transformMatrix.compose(t_cam_to_world, q_cam_to_world, new THREE.Vector3(1, 1, 1)); // Position, Quaternion, Scale

                // Transform frustum points from camera space to world space
                const worldFrustumPoints = cameraFrustumPoints.map(p => p.clone().applyMatrix4(transformMatrix));

                // Create geometry for the lines
                const frustumGeometry = new THREE.BufferGeometry().setFromPoints(worldFrustumPoints);
                frustumGeometry.setIndex(frustumLineIndices);

                // Create a UNIQUE material instance for each frustum
                const frustumMaterial = new THREE.LineBasicMaterial({ 
                    color: 0x888888, // Default grey
                    // If you want to add opacity variation later:
                    // transparent: true, 
                    // opacity: 1.0 
                }); 

                // Create line segments object
                const frustumLines = new THREE.LineSegments(frustumGeometry, frustumMaterial);

                // Add to scene
                mapGroup.add(frustumLines); // Add frustum to the group instead of the scene

                // Apply the initial default scale
                frustumLines.scale.set(DEFAULT_FRUSTUM_SCALE, DEFAULT_FRUSTUM_SCALE, DEFAULT_FRUSTUM_SCALE);

                // Store the frustum object in the map using its ID
                if (frameId !== undefined) {
                    // Ensure the key is a string for consistent lookup with search results
                    frustumMap[String(frameId)] = frustumLines; 
                }
            });
            console.log('Finished drawing frustums. Frustum Map Keys:', Object.keys(frustumMap)); // Log keys after creation
        })
        .catch(error => {
            console.error('Error loading or processing frame poses:', error);
            // Optional: Display an error message in the UI
            const container = document.getElementById('pointCloudContainer');
            if (container) {
                container.innerHTML += '<p style="color: red;">Error loading camera frustums.</p>';
            }
        });
}

function onWindowResize() {
    const container = document.getElementById('pointCloudContainer');
    if (!container) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update(); // only required if controls.enableDamping = true, or if controls.autoRotate = true
    render();
}

function render() {
    renderer.render(scene, camera);
}

// Dark mode
document.addEventListener('DOMContentLoaded', (event) => {
    const bodyElement = document.body;
    const darkModeToggle = document.getElementById('darkModeToggle');

    // Check for saved user preference, if any, on page load
    if (localStorage.getItem('darkMode') === 'enabled') {
        bodyElement.classList.add('dark-mode');
        if (scene) scene.background = new THREE.Color(0x121212); // Update scene background
    }

    // Toggle dark mode
    darkModeToggle.addEventListener('click', () => {
        bodyElement.classList.toggle('dark-mode');
        // Save the user preference in localStorage
        if (bodyElement.classList.contains('dark-mode')) {
            localStorage.setItem('darkMode', 'enabled');
            if (scene) scene.background = new THREE.Color(0x121212); // Update scene background
        } else {
            localStorage.setItem('darkMode', 'disabled');
            if (scene) scene.background = new THREE.Color(0xf4f7f6); // Update scene background
        }
    });

    // Initialize the point cloud viewer after the DOM is ready
    initPointCloud();
}); 