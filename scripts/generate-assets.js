const fs = require('fs');
const { createCanvas } = require('canvas');

// Create assets directory if it doesn't exist
if (!fs.existsSync('./assets')) {
    fs.mkdirSync('./assets');
}

// Function to create a simple placeholder image
function createPlaceholderImage(width, height, filename, text) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Add border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Add text
    ctx.fillStyle = '#000000';
    ctx.font = `${Math.min(width, height) / 10}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    // Save the image
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(`./assets/${filename}`, buffer);
}

// Create all required assets
createPlaceholderImage(1024, 1024, 'icon.png', 'Icon');
createPlaceholderImage(1242, 2436, 'splash.png', 'Splash');
createPlaceholderImage(1024, 1024, 'adaptive-icon.png', 'Adaptive Icon');
createPlaceholderImage(48, 48, 'favicon.png', 'Favicon');

console.log('Assets generated successfully!'); 