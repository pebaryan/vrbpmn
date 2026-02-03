# PRD — SPEAR VR BPMN Authoring (v0.3)

## 1) Purpose
Build a browser-based 3D/VR authoring tool for BPMN process definitions for the SPEAR semantic process engine. The UI uses novel 3D metaphors while preserving BPMN compatibility.

## 2) Goals (v1)
- Author BPMN process definitions in 3D.
- Export BPMN XML + BPMN DI so diagrams open in Camunda Modeler.
- WebXR-ready architecture with full desktop web fallback (mouse/keyboard).

## 3) Non-Goals (v1)
- Runtime instance monitoring/operations.
- Authentication/permissions.
- Collaboration/multi-user sessions.
- Swimlanes and strict BPMN validation rules.

## 4) In-Scope BPMN Elements (v1)
- Events: Start, End
- Tasks: User Task, Service Task
- Gateways: Exclusive, Parallel
- Sequence Flows

## 5) Functional Requirements

### 5.1 Authoring
- Create, select, move, rename, and delete nodes.
- Connect nodes via sequence flows.
- Add node types via palette (limited to v1 elements).
- Edit properties: id, name, description.
- Node IDs auto-generated with manual override.

### 5.2 BPMN Compatibility
- Export BPMN XML compatible with SPEAR import.
- Include BPMN DI (shapes + edges) for Camunda Modeler layout.
- Element mapping:
  - Start event → bpmn:startEvent
  - End event → bpmn:endEvent
  - User task → bpmn:userTask
  - Service task → bpmn:serviceTask
  - Exclusive gateway → bpmn:exclusiveGateway
  - Parallel gateway → bpmn:parallelGateway
  - Sequence flow → bpmn:sequenceFlow

### 5.3 Interaction
- Desktop: click select, drag move, orbit/pan/zoom, keyboard shortcuts for modes.
- WebXR: controller ray select, grab/drag, radial menu (planned).

### 5.4 Visual Metaphors
- Nodes as translucent volumes with inner glowing icon per type.
- Edges as luminous tubes with direction indicators.
- Readable labels (billboarded).

### 5.5 Persistence
- Save/load locally (JSON for editor state).
- Export BPMN XML + DI.

## 6) UX/UI
- 3D ground/grid for spatial orientation.
- Tool modes: move/add/link/delete.
- Properties panel for selected node.
- Target scale: ~20–25 elements.

## 7) Performance
- Smooth interaction at small graph sizes.
- Desktop 60 FPS target; stable VR frame pacing.

## 8) Success Criteria
- Users can build a valid BPMN definition (v1 element set) and export BPMN XML + DI.
- Exported diagrams open correctly in Camunda Modeler with preserved layout.
- Basic process authored in under 10 minutes.

## 9) Milestones (v1)

### M0 — Foundations
- BPMN element schema + 3D metaphor mapping.
- ID strategy with manual override.
- Local JSON save/load.
- BPMN XML + DI export.

### M1 — Authoring MVP
- Node creation/move/delete/link.
- Properties panel (id/name/description).
- Layout metadata capture.
- Camunda Modeler export validation.

### M2 — WebXR + UX Polish
- WebXR controller selection + drag.
- Radial menu for tool modes.
- Readability/lighting/snap improvements.

## 10) Backlog (v1)

### Epic A: Core Data Model
- A1 Unique auto IDs for nodes
- A2 Manual ID override
- A3 JSON save/load

### Epic B: Authoring Interactions
- B1 Add core BPMN node types
- B2 Move nodes; positions persist
- B3 Delete nodes + flows
- B4 Create sequence flows
- B5 Delete sequence flows

### Epic C: Properties & Metadata
- C1 Edit name/description
- C2 Show/edit ID + type

### Epic D: BPMN Export (XML + DI)
- D1 Export BPMN XML
- D2 Include BPMN DI
- D3 Correct BPMN element mapping

### Epic E: Desktop Interaction & UX
- E1 Orbit/pan/zoom; selection
- E2 Tool modes with shortcuts
- E3 Readable labels

### Epic F: WebXR (Planned)
- F1 Ray select
- F2 Grab/drag
- F3 Radial menu
