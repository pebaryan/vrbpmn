# VRBPMN - Virtual Reality Business Process Model and Notation

SPEAR VR BPMN Authoring is a futuristic 3D/VR process modeling tool built with Angular and Three.js for visualizing and interacting with business process workflows in an immersive environment. It exports BPMN XML + BPMN DI for validation in Camunda Modeler and provides a desktop fallback alongside WebXR readiness.

## Docs
- Product requirements: `PRD.md`

## 🚀 Quick Start

```bash
# Navigate to the Angular project directory
cd ng-vrbpmn

# Install dependencies
npm install

# Start the development server
ng serve

# Open your browser to http://localhost:4200
```

## 🛠 Development

```bash
# Generate a new component (Angular CLI)
ng generate component component-name

# Build for production
ng build

# Run unit tests
ng test

# Run end-to-end tests (requires an e2e framework)
ng e2e
```

## 📁 Project Structure

```
vrbpmn/
├── ng-vrbpmn/                  # Main Angular application
│   ├── src/
│   │   ├── app/
│   │   │   ├── process-view-ngthree/  # Core 3D process visualization
│   │   │   │   ├── process-state.service.ts  # State management
│   │   │   │   ├── process-view-ngthree.component.ts  # Main 3D component
│   │   │   │   ├── ui-overlay.component.ts  # UI controls
│   │   │   │   ├── process-view.constants.ts  # Configuration
│   │   │   │   └── process-view.types.ts  # Type definitions
│   │   │   ├── app.ts  # Root component
│   │   │   ├── app.routes.ts  # Routing
│   │   │   └── app.config.ts  # Angular configuration
│   │   ├── main.ts  # Application entry point
│   │   └── index.html  # HTML template
│   ├── angular.json  # Angular configuration
│   └── package.json  # Dependencies
├── prototypes/                # Early HTML/JS prototypes
│   ├── p1.html  # Initial prototype
│   ├── p2.html  # Intermediate prototype
│   └── p3.html  # Advanced prototype
└── design/                    # Design assets and documentation
```

## 🎮 Features

### 3D Process Visualization
- **Interactive 3D Nodes**: Different node types (Start, User Task, Service Task, Gateways, Terminal)
- **Dynamic Connections**: Auto-routing connections with rounded corners
- **Real-time Animation**: Smooth rotations, hover effects, and bouncing animations
- **Futuristic Aesthetics**: Glass-like materials, neon highlights, and dark theme

### Interaction Modes
- **MOVE Mode**: Drag and drop nodes to reposition them
- **ADD Mode**: Click on the ground to add new nodes
- **LINK Mode**: Connect nodes by selecting source and target
- **DELETE Mode**: Remove nodes and connections

### UI Components
- **Toolbar**: Left-side vertical toolbar for mode selection
- **Property Sidebar**: Right-side panel showing node details
- **Status Bar**: Bottom bar showing current system status
- **Modal Dialogs**: Detailed node information popups

## 🔧 Technology Stack

- **Framework**: Angular 20+ with Standalone Components
- **3D Engine**: Three.js via ngx-three wrapper
- **State Management**: Angular Signals
- **Styling**: SCSS with CSS variables
- **Build System**: Vite (via Angular CLI)

## 📦 Key Dependencies

```json
{
  "@angular/core": "^20.3.16",
  "three": "^0.182.0",
  "ngx-three": "^0.43.3",
  "rxjs": "~7.8.2"
}
```

## 🎨 Design Philosophy

The VRBPMN tool features a futuristic cyberpunk aesthetic:

- **Color Scheme**: Dark blue/black background with cyan neon accents
- **Materials**: Glass-like transparency with subtle reflections
- **Typography**: Monospace and sans-serif fonts with uppercase styling
- **Animations**: Smooth transitions, hover effects, and interactive feedback
- **Layout**: Clean, minimalist interface with floating elements

## 🚀 Development Workflow

### Building for Production

```bash
ng build
```

Build artifacts will be placed in `dist/ng-vrbpmn/` directory.

### Running Tests

```bash
ng test
```

### Code Quality

The project uses:
- **Prettier** for code formatting
- **TypeScript** for type safety
- **ESLint** for linting (via Angular CLI)

## 🔍 Architecture Overview

### State Management

The `ProcessStateService` manages all application state using Angular Signals:

- **Nodes**: Array of process nodes with positions and types
- **Connections**: Array of connections between nodes
- **Interaction Mode**: Current user interaction mode
- **Selection State**: Currently selected/hovered/dragged nodes

### 3D Rendering

The `ProcessViewNgThreeComponent` handles:
- **Scene Setup**: Camera, lights, ground plane
- **Node Rendering**: Different geometries for each node type
- **Connection Paths**: Computed geometry for smooth connections
- **Event Handling**: Mouse interactions and animations

### UI Layer

The `UIOverlayComponent` provides:
- **Mode Selection**: Toolbar buttons for different interaction modes
- **Node Properties**: Sidebar showing selected node details
- **Status Updates**: Real-time feedback on user actions
- **Modal Dialogs**: Detailed information views

## 🎯 Node Types

| Type | Geometry | Description |
|------|----------|-------------|
| `start` | Sphere | Beginning of a process |
| `usertask` | Cylinder | User interaction task |
| `servicetask` | Box | Automated service task |
| `xgateway` | Octahedron | Exclusive gateway (XOR) |
| `pgateway` | Capsule | Parallel gateway (AND) |
| `terminal` | Torus | End of a process |

## 🔗 Connection System

Connections feature:
- **Auto-routing**: Intelligent path finding around nodes
- **Rounded Corners**: Smooth bezier curves for aesthetics
- **Visual Feedback**: Highlighting on hover and selection
- **Arrow Indicators**: Directional arrows showing flow
- **Footprints**: Visual markers at connection points

## 🎮 User Interaction

### Keyboard Shortcuts

- **ESC**: Deselect current node
- **1-6**: Quick select node types (when in ADD mode)

### Mouse Controls

- **Left Click**: Select nodes, add nodes, create connections
- **Right Click + Drag**: Pan camera
- **Scroll**: Zoom in/out
- **Drag**: Move nodes (in MOVE mode)

## 📈 Performance Optimization

- **Geometry Caching**: Reuse connection geometries to reduce memory
- **Computed Signals**: Only recalculate when data changes
- **Efficient Rendering**: Use Three.js instanced meshes where possible
- **Memory Management**: Proper disposal of geometries on component destroy

## 🌐 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Create a new Pull Request

## 📚 Documentation

Comprehensive documentation is available:

- **[GETTING_STARTED.md](GETTING_STARTED.md)** - User guide and tutorial
- **[DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md)** - Developer setup instructions
- **[TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md)** - Architecture and API reference
- **[INDEX.md](INDEX.md)** - Documentation hub and navigation guide

For interactive navigation, run:
```bash
./docs-navigator.sh
```

## 📬 Contact

For questions or support, please open an issue on GitHub.

---

**VRBPMN** - Where business processes meet virtual reality! 🚀
