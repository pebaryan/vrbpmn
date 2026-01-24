# VRBPMN - Getting Started Guide

Welcome to VRBPMN! This guide will help you get up and running with our futuristic 3D process modeling tool.

## 🚀 Quick Start

### 1. Launch the Application

```bash
# Navigate to the project directory
cd vrbpmn/vrbpmn/ng-vrbpmn

# Install dependencies (first time only)
npm install

# Start the application
ng serve
```

### 2. Open in Browser

Open your web browser and go to: [http://localhost:4200](http://localhost:4200)

## 🎮 User Interface Overview

```
┌─────────────────────────────────────────────────────┐
│                     HEADER BAR                      │
│  FUTURISTIC PROCESS MAP v1.0                        │
│  SYSTEM STATUS: ACTIVE                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│                                                     │
│                3D PROCESS VIEW                      │
│                                                     │
│                                                     │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [MOVE]  [ADD]  [LINK]  [DELETE]                   │
│                                                     │
│  STATUS: System Ready                               │
└─────────────────────────────────────────────────────┘
```

## 🎯 Basic Concepts

### Nodes

Nodes represent different types of process steps:

| Icon | Type | Description |
|------|------|-------------|
| 🔘 | **Start** | Beginning of a process flow |
| 📦 | **User Task** | Requires human interaction |
| 📦 | **Service Task** | Automated system task |
| ⬢ | **X Gateway** | Exclusive decision point (XOR) |
| ⬢ | **P Gateway** | Parallel execution point (AND) |
| 🎯 | **Terminal** | End of a process flow |

### Connections

Connections show the flow between nodes with:
- **Cyan lines** connecting nodes
- **Arrowheads** showing direction
- **Footprints** at connection points

## 🕹 Interaction Modes

### 1. MOVE Mode (Default)

**Icon**: ✥

**Usage**:
- **Click** on a node to select it
- **Drag** a node to move it
- **Click** on a node label to view details

**Best for**: Rearranging your process flow

### 2. ADD Mode

**Icon**: ＋

**Usage**:
1. Click the **ADD** button
2. Select a node type from the bottom toolbar
3. Click anywhere on the ground to place a new node

**Best for**: Building new process flows

### 3. LINK Mode

**Icon**: 🔗

**Usage**:
1. Click the **LINK** button
2. Click the **source** node (where connection starts)
3. Click the **target** node (where connection ends)

**Best for**: Connecting nodes to define flow

### 4. DELETE Mode

**Icon**: ✕

**Usage**:
- Click on any **node** to delete it (and its connections)
- Click on any **connection** to delete it

**Best for**: Cleaning up your process model

## 🎨 Creating Your First Process

### Step 1: Start with a Start Node

Your process already has a **Start** node. This is where every process begins!

### Step 2: Add a User Task

1. Click **ADD** mode
2. Select **USERTASK** from the bottom toolbar
3. Click on the ground to the right of the Start node
4. A new User Task node appears

### Step 3: Connect the Nodes

1. Click **LINK** mode
2. Click the **Start** node
3. Click the **User Task** node
4. A connection is created between them

### Step 4: Add More Nodes

Continue adding nodes and connecting them to build your process flow:

```
[START] → [User Task] → [Service Task] → [Terminal]
```

### Step 5: Rearrange Your Process

1. Click **MOVE** mode
2. Drag nodes to position them nicely
3. Watch as connections automatically reroute

## 🎮 Advanced Features

### Node Properties

- Click on any node to see its properties in the right sidebar
- Click **VIEW DETAILS** to see more information in a modal

### Status Messages

- Watch the bottom status bar for real-time feedback
- Messages show your current mode and actions

### Camera Controls

- **Right-click + drag**: Pan the camera
- **Scroll wheel**: Zoom in/out
- **Left-click + drag**: Rotate view (when not in ADD mode)

## 💡 Tips & Tricks

### Quick Node Selection

- Click on node **labels** to quickly select and view details
- Selected nodes glow with cyan highlights

### Smooth Movements

- Nodes snap to a grid when moved
- Connections automatically reroute when nodes move
- Hover over nodes to see them bounce and rotate faster

### Keyboard Shortcuts

- **ESC**: Deselect current node
- **1-6**: Quick select node types (when in ADD mode)

### Visual Feedback

- **Hover**: Nodes glow and bounce when hovered
- **Selection**: Selected nodes have brighter highlights
- **Connections**: Connections fade when not in DELETE mode

## 📚 Example Process Flows

### Simple Linear Process

```
[START] → [User Task: Approve Request] → [Service Task: Send Email] → [Terminal]
```

### Decision Process

```
[START] → [User Task: Submit Form]
          ↓
    [X Gateway: Approved?]
    ↓                     ↓
[Service Task: Process]  [User Task: Reject]
    ↓                     ↓
    [Terminal]          [Terminal]
```

### Parallel Process

```
[START] → [User Task: Start Process]
          ↓
    [P Gateway: Fork]
    ↓         ↓
[Task A]   [Task B]
    ↓         ↓
    [P Gateway: Join]
          ↓
      [Terminal]
```

## 🐛 Troubleshooting

### Common Issues

**Problem**: Nodes don't appear
- **Solution**: Check if the application loaded correctly. Refresh the page.

**Problem**: Can't add nodes
- **Solution**: Make sure you're in **ADD** mode and clicking on the ground.

**Problem**: Connections don't work
- **Solution**: Ensure you're in **LINK** mode and clicking nodes in order.

**Problem**: Camera won't move
- **Solution**: Make sure you're not in **ADD** mode (camera is locked for precise placement).

### Browser Compatibility

For best results, use:
- **Chrome 90+** (recommended)
- **Firefox 88+**
- **Safari 14+**
- **Edge 90+**

## 📈 Performance Tips

- **Limit nodes**: Too many nodes can slow down rendering
- **Simple connections**: Complex connection paths are more expensive
- **Close other apps**: Free up system resources for smoother experience
- **Use latest browser**: Newer browsers have better WebGL support

## 🎨 Customization

### Node Types

You can create processes using these node types:

- **Start**: Beginning of process (can't have incoming connections)
- **User Task**: Human interaction required
- **Service Task**: Automated system task
- **X Gateway**: Exclusive decision (only one path taken)
- **P Gateway**: Parallel execution (all paths taken)
- **Terminal**: End of process (can't have outgoing connections)

### Visual Styles

- **Glass nodes**: Semi-transparent with reflections
- **Neon connections**: Cyan lines with glow effects
- **Dark theme**: Futuristic cyberpunk aesthetic
- **Smooth animations**: Subtle rotations and bounces

## 📖 Learning More

### About BPMN

VRBPMN is inspired by **BPMN (Business Process Model and Notation)**, an industry standard for process modeling. Learn more:

- [BPMN Official Specification](https://www.omg.org/spec/BPMN)
- [BPMN Quick Guide](https://www.bpmnquickguide.com)
- [BPMN Tutorial](https://www.lucidchart.com/pages/bpmn-tutorial)

### About the Technology

- **Angular**: Modern web framework by Google
- **Three.js**: 3D graphics library for the web
- **WebGL**: Browser-based 3D rendering

## 🤝 Getting Help

If you encounter issues or have questions:

1. **Check this documentation** for answers
2. **Review the technical documentation** for advanced topics
3. **Open an issue** on GitHub with details
4. **Ask the community** on Stack Overflow with `#vrbpmn` tag

## 🎯 Next Steps

Now that you're familiar with the basics:

1. **Experiment**: Try creating different process flows
2. **Explore**: Test all interaction modes
3. **Customize**: Build complex processes with gateways
4. **Share**: Export and share your process models
5. **Extend**: Learn about advanced features in the technical docs

---

**Happy process modeling! 🚀**

*VRBPMN Team*

*Where business processes meet virtual reality!*
