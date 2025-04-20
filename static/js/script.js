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

// Dark mode
document.addEventListener('DOMContentLoaded', (event) => {
    const bodyElement = document.body;
    const darkModeToggle = document.getElementById('darkModeToggle');

    // Check for saved user preference, if any, on page load
    if (localStorage.getItem('darkMode') === 'enabled') {
        bodyElement.classList.add('dark-mode');
    }

    // Toggle dark mode
    darkModeToggle.addEventListener('click', () => {
        bodyElement.classList.toggle('dark-mode');
        // Save the user preference in localStorage
        if (bodyElement.classList.contains('dark-mode')) {
            localStorage.setItem('darkMode', 'enabled');
        } else {
            localStorage.setItem('darkMode', 'disabled');
        }
    });
}); 