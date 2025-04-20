// Get the search input field
var searchInput = document.getElementById('search');

// Automatically focus the search bar when the page loads
searchInput.focus();

document.getElementById('searchForm').addEventListener('submit', function(event) {
    // Prevent the form from being submitted in the standard way
    event.preventDefault();

    // Get the value from the search input field
    var searchTerm = searchInput.value;

    // Send a GET request to the /search endpoint on the server
    fetch('/search?term=' + encodeURIComponent(searchTerm))
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            // Check if the data has the expected 'frame_ids' property
            if (!data || !Array.isArray(data.frame_ids)) {
                console.error('Invalid data format received from server:', data);
                throw new Error('Invalid data format received from server.');
            }

            // Remove any previously displayed images
            var imageContainer = document.getElementById('imageContainer');
            imageContainer.innerHTML = ''; // Clear previous results efficiently

            // For each frame ID returned by the server...
            data.frame_ids.forEach(frameId => {
                // Create a new div element with class 'card'
                var card = document.createElement('div');
                card.className = 'card';

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
            var imageContainer = document.getElementById('imageContainer');
            imageContainer.innerHTML = `<p style="color: red;">Error during search: ${error.message}</p>`;
        });
});

// Three.js Point Cloud Viewer
let scene, camera, renderer, controls;

function initPointCloud() {
    const container = document.getElementById('pointCloudContainer');
    if (!container) {
        console.error('Point cloud container not found.');
        return;
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('background-color')); // Match body background

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

            scene.add(points);
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