# Reelworld

A Babylon.js snow world exploration game with character controls, procedural terrain, and dynamic weather effects.

## Setup

This project uses Vite for development and building.

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

This will start the development server on http://localhost:8080

### Build

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## Features

- **Character Controls**: WASD keyboard controls or mobile joystick/buttons
- **Physics**: Havok physics engine for realistic movement and collisions
- **Mobile Support**: Touch controls with on-screen joystick and buttons

## Controls

### Desktop
- **W/A/S/D** or **Arrow Keys**: Move character
- **Space**: Jump
- **Mouse**: Rotate camera

### Mobile
- **Left Joystick**: Move character
- **Fishing Reel**: Reel Em In
- **Touch and drag**: Rotate camera

## Project Structure

```
reelworld/
├── src/
│   ├── main.js              # Main entry point
│   ├── CharacterControls.js # Character movement and animation
│   ├── Level.js             # Terrain and environment
├── assets/                  # Game assets (models, textures, etc.)
├── lib/                     # Third-party libraries (nipplejs)
├── index.html              # Main HTML file
├── styles.css              # Styling
├── vite.config.js          # Vite configuration
└── package.json            # Dependencies and scripts
```

## Technology Stack

- **Babylon.js 8.38.0**: 3D engine
- **Havok Physics 1.3.10**: Physics simulation
- **Vite 7.2.4**: Build tool and dev server
- **nipplejs**: Touch joystick controls
