import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  applyOperation,
  createDemoProject,
  createManifest,
  encodeGif,
  emptyGrid,
  getCharacter,
  getFrame,
  invertOperation,
  packSpriteSheet,
  pixelateImage,
  renderAnimation,
  renderFrame,
  validateProject,
  type Character,
  type DirectionalView,
  type Frame,
  type Layer,
  type PixelGrid,
  type PixelOperation,
  type PixelProject,
  type RenderedFrame,
  type SheetLayout,
  type TokenId,
} from "@code-as-pixelart/core";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { PixelIcon, type IconName } from "./icons";

type Tool = "pencil" | "eraser" | "fill" | "picker" | "marquee" | "lasso" | "move";
type SelectionMode = "replace" | "add" | "subtract";
type Modal = "import" | "export" | "help" | "about" | null;
interface PixelPoint { x: number; y: number }
interface SelectionShape { kind: "rect" | "lasso"; points: PixelPoint[] }

const tools: Array<{ id: Tool; label: string; key: string; icon: IconName }> = [
  { id: "pencil", label: "Pencil", key: "B", icon: "pencil" },
  { id: "eraser", label: "Eraser", key: "E", icon: "eraser" },
  { id: "fill", label: "Fill", key: "G", icon: "fill" },
  { id: "picker", label: "Eyedropper", key: "I", icon: "picker" },
  { id: "marquee", label: "Marquee", key: "M", icon: "marquee" },
  { id: "lasso", label: "Lasso", key: "L", icon: "lasso" },
  { id: "move", label: "Move part", key: "V", icon: "move" },
];

export function App() {
  const [project, setProject] = useState<PixelProject>(() => loadAutosave() ?? createDemoProject());
  const character = project.characters[0]!;
  const [viewId, setViewId] = useState(character.views[0]!.id);
  const view = character.views.find((item) => item.id === viewId) ?? character.views[0]!;
  const [frameId, setFrameId] = useState(view.frames[0]!.id);
  const frame = view.frames.find((item) => item.id === frameId) ?? view.frames[0]!;
  const [layerId, setLayerId] = useState(character.layers.at(-1)!.id);
  const layer = character.layers.find((item) => item.id === layerId) ?? character.layers.at(-1)!;
  const [tool, setTool] = useState<Tool>("pencil");
  const [foreground, setForeground] = useState<TokenId>("coat-light");
  const [background, setBackground] = useState<TokenId>("ink");
  const [zoom, setZoom] = useState(18);
  const [showGrid, setShowGrid] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [onionSkin, setOnionSkin] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [animationId, setAnimationId] = useState(character.animations.find((item) => item.viewId === view.id && item.tags.includes("walk"))?.id ?? character.animations.find((item) => item.viewId === view.id)?.id ?? "");
  const [variantId, setVariantId] = useState<string>("");
  const [poseId, setPoseId] = useState<string>("neutral");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("replace");
  const [selections, setSelections] = useState<SelectionShape[]>([]);
  const [cursor, setCursor] = useState<PixelPoint>({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState("Ready");
  const [selectedFrames, setSelectedFrames] = useState<string[]>([frame.id]);
  const [undoStack, setUndoStack] = useState<PixelOperation[]>([]);
  const [redoStack, setRedoStack] = useState<PixelOperation[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const adaptPanels = () => {
      if (window.innerWidth <= 620) { setShowInspector(false); setShowTimeline(false); }
    };
    adaptPanels();
    window.addEventListener("resize", adaptPanels);
    return () => window.removeEventListener("resize", adaptPanels);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("pix-project-v1", JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    if (!character.views.some((item) => item.id === viewId)) setViewId(character.views[0]!.id);
    if (!view.frames.some((item) => item.id === frameId)) setFrameId(view.frames[0]!.id);
    if (!character.layers.some((item) => item.id === layerId)) setLayerId(character.layers.at(-1)!.id);
  }, [character, view, viewId, frameId, layerId]);

  useEffect(() => {
    if (!character.animations.some((item) => item.id === animationId && item.viewId === view.id)) setAnimationId(character.animations.find((item) => item.viewId === view.id && item.tags.includes("walk"))?.id ?? character.animations.find((item) => item.viewId === view.id)?.id ?? "");
  }, [character.animations, animationId, view.id]);

  useEffect(() => {
    if (!project.palette.some((item) => item.id === foreground)) setForeground(project.palette[0]?.id ?? "");
    if (!project.palette.some((item) => item.id === background)) setBackground(project.palette[1]?.id ?? project.palette[0]?.id ?? "");
  }, [project.palette, foreground, background]);

  const execute = useCallback((operation: PixelOperation, message: string = operation.type) => {
    setProject((current) => {
      const inverse = invertOperation(current, operation);
      setUndoStack((stack) => [...stack, inverse].slice(-200));
      setRedoStack([]);
      return applyOperation(current, operation);
    });
    setNotice(message);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const operation = stack.at(-1);
      if (!operation) return stack;
      setProject((current) => {
        setRedoStack((redo) => [...redo, invertOperation(current, operation)]);
        return applyOperation(current, operation);
      });
      setNotice("Undo");
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      const operation = stack.at(-1);
      if (!operation) return stack;
      setProject((current) => {
        setUndoStack((undoItems) => [...undoItems, invertOperation(current, operation)]);
        return applyOperation(current, operation);
      });
      setNotice("Redo");
      return stack.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      const shortcut = tools.find((item) => item.key.toLowerCase() === key);
      if (shortcut) { setTool(shortcut.id); event.preventDefault(); }
      if (event.key === "Tab") { setShowTimeline((visible) => !visible); event.preventDefault(); }
      if ((event.metaKey || event.ctrlKey) && key === "z") { event.shiftKey ? redo() : undo(); event.preventDefault(); }
      if ((event.metaKey || event.ctrlKey) && key === "y") { redo(); event.preventDefault(); }
      if (/^[1-6]$/.test(event.key)) { setZoom([4, 8, 12, 18, 24, 32][Number(event.key) - 1]!); event.preventDefault(); }
      if (key === "x") { setForeground(background); setBackground(foreground); }
      if (event.key === "Escape") { setMenuOpen(null); setSelections([]); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [background, foreground, redo, undo]);

  useEffect(() => {
    if (!playing) return;
    const delay = Math.max(40, (frame.durationTicks / project.ticksPerSecond) * 1000);
    const timer = window.setTimeout(() => {
      const clip = character.animations.find((item) => item.id === animationId && item.viewId === view.id);
      const sequence = clip?.frames.map((item) => item.frameId) ?? view.frames.map((item) => item.id);
      const index = sequence.indexOf(frame.id);
      const atEnd = index === sequence.length - 1;
      if (atEnd && clip && !clip.loop) { setPlaying(false); return; }
      const nextId = sequence[index < 0 ? 0 : (index + 1) % sequence.length]!;
      setFrameId(nextId);
      setSelectedFrames([nextId]);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, frame, project.ticksPerSecond, view, character.animations, animationId]);

  const renderOptions = { characterId: character.id, viewId: view.id, frameId: frame.id, ...(poseId ? { poseId } : {}), ...(variantId ? { variantId } : {}) };
  const rendered = useMemo(() => renderFrame(project, renderOptions), [project, character.id, view.id, frame.id, poseId, variantId]);
  const previous = onionSkin ? view.frames[Math.max(0, view.frames.findIndex((item) => item.id === frame.id) - 1)] : undefined;
  const next = onionSkin ? view.frames[Math.min(view.frames.length - 1, view.frames.findIndex((item) => item.id === frame.id) + 1)] : undefined;
  const onionFrames = useMemo(() => ({
    ...(previous && previous.id !== frame.id ? { previous: renderFrame(project, { ...renderOptions, frameId: previous.id }) } : {}),
    ...(next && next.id !== frame.id ? { next: renderFrame(project, { ...renderOptions, frameId: next.id }) } : {}),
  }), [project, previous, next, frame.id, character.id, view.id, poseId, variantId]);

  const paintPixel = useCallback((x: number, y: number, button: number, forcePick = false) => {
    const activeFrame = getFrame(getCharacter(project, character.id), view.id, frame.id);
    const activeCel = activeFrame.cels[layer.id];
    if (!activeCel || layer.locked) return;
    const sourceX = x - activeCel.offset.x;
    const sourceY = y - activeCel.offset.y;
    if (sourceX < 0 || sourceY < 0 || sourceX >= activeCel.grid.width || sourceY >= activeCel.grid.height) return;
    if (forcePick || tool === "picker") {
      const token = activeCel.grid.cells[sourceY * activeCel.grid.width + sourceX];
      if (token) { setForeground(token); setNotice(`Picked ${token}`); }
      return;
    }
    const tokenId = tool === "eraser" ? null : button === 2 ? background : foreground;
    if (tool === "fill") execute({ type: "fillRegion", characterId: character.id, viewId: view.id, frameId: frame.id, layerId: layer.id, x: sourceX, y: sourceY, tokenId }, `Filled ${layer.name}`);
    else if (tool === "pencil" || tool === "eraser") execute({ type: "setPixel", characterId: character.id, viewId: view.id, frameId: frame.id, layerId: layer.id, x: sourceX, y: sourceY, tokenId }, tool === "eraser" ? "Erased pixel" : `Painted ${tokenId}`);
  }, [project, character.id, view.id, frame.id, layer, tool, background, foreground, execute]);

  const movePart = useCallback((dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    execute({ type: "movePart", characterId: character.id, viewId: view.id, frameId: frame.id, partId: layer.partId, dx, dy }, `Moved ${layer.name} ${dx}, ${dy}`);
  }, [character.id, view.id, frame.id, layer, execute]);

  const commitSelection = useCallback((selection: SelectionShape) => {
    setSelections((current) => selectionMode === "replace" ? [selection] : selectionMode === "add" ? [...current, selection] : current.filter((item) => !shapesOverlap(item, selection)));
    setNotice(`${selectionMode} selection`);
  }, [selectionMode]);

  const addLayer = () => {
    const id = uniqueId("layer", character.layers.map((item) => item.id));
    execute({ type: "addLayer", characterId: character.id, layer: { id, name: "New layer", partId: "root", zIndex: (character.layers.at(-1)?.zIndex ?? 0) + 10, visible: true, locked: false, linked: false } }, "Added layer");
    setLayerId(id);
  };

  const duplicateLayer = () => {
    const id = uniqueId(`${layer.id}-copy`, character.layers.map((item) => item.id));
    const newLayer: Layer = { ...layer, id, name: `${layer.name} copy`, zIndex: layer.zIndex + 1 };
    const operations: PixelOperation[] = [{ type: "addLayer", characterId: character.id, layer: newLayer }];
    for (const sourceView of character.views) for (const sourceFrame of sourceView.frames) {
      const sourceCel = sourceFrame.cels[layer.id];
      if (!sourceCel) continue;
      sourceCel.grid.cells.forEach((tokenId, index) => {
        if (tokenId) operations.push({ type: "setPixel", characterId: character.id, viewId: sourceView.id, frameId: sourceFrame.id, layerId: id, x: index % sourceCel.grid.width, y: Math.floor(index / sourceCel.grid.width), tokenId });
      });
    }
    execute({ type: "batch", operations }, "Duplicated layer");
    setLayerId(id);
  };

  const addFrame = (duplicate = true) => {
    const id = uniqueId(`${view.id}-frame`, view.frames.map((item) => item.id));
    const newFrame: Frame = duplicate ? structuredClone(frame) : { id, name: "New frame", durationTicks: 2, cels: Object.fromEntries(character.layers.map((item) => { const sourceCel = frame.cels[item.id]; return [item.id, item.linked && sourceCel ? structuredClone(sourceCel) : { grid: emptyGrid(character.width, character.height), offset: { x: 0, y: 0 } }]; })) };
    newFrame.id = id;
    newFrame.name = duplicate ? `${frame.name} copy` : "New frame";
    execute({ type: "addFrame", characterId: character.id, viewId: view.id, frame: newFrame, index: view.frames.findIndex((item) => item.id === frame.id) + 1 }, duplicate ? "Duplicated frame" : "Added frame");
    setFrameId(id); setSelectedFrames([id]);
  };

  const chooseFrame = (id: string, event: React.MouseEvent) => {
    const index = view.frames.findIndex((item) => item.id === id);
    if (event.shiftKey && selectedFrames.length) {
      const first = view.frames.findIndex((item) => item.id === selectedFrames[0]);
      setSelectedFrames(view.frames.slice(Math.min(first, index), Math.max(first, index) + 1).map((item) => item.id));
    } else if (event.metaKey || event.ctrlKey) setSelectedFrames((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    else setSelectedFrames([id]);
    setFrameId(id);
  };

  const newDocument = () => {
    const blank = createDemoProject();
    blank.id = `untitled-${Date.now()}`;
    blank.name = "Untitled Character";
    blank.characters[0]!.name = "Untitled";
    for (const sourceView of blank.characters[0]!.views) for (const sourceFrame of sourceView.frames) for (const cel of Object.values(sourceFrame.cels)) cel.grid.cells.fill(null);
    for (const variant of blank.characters[0]!.variants) for (const cel of Object.values(variant.celOverrides)) cel.grid.cells.fill(null);
    setProject(blank); setUndoStack([]); setRedoStack([]); setVariantId(""); setNotice("New 24 × 24 character");
  };

  const importProject = async (file: File) => {
    try {
      const imported = JSON.parse(await file.text()) as PixelProject;
      const validation = validateProject(imported);
      if (!validation.valid) throw new Error(`${validation.issues[0]!.path}: ${validation.issues[0]!.message}`);
      setProject(imported); setUndoStack([]); setRedoStack([]); setNotice(`Opened ${file.name}`);
    } catch (error) { setNotice(`Open failed: ${error instanceof Error ? error.message : String(error)}`); }
  };

  const importMascot = async (file: File, options: { width: number; height: number; colors: number; removeBackground: boolean }) => {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas image decoding is unavailable");
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
      const imported = pixelateImage({ width: bitmap.width, height: bitmap.height, pixels: data.data }, { name: file.name.replace(/\.[^.]+$/, ""), ...options, cropToContent: true });
      const importedCharacter = imported.characters[0]!;
      setProject(imported); setViewId(importedCharacter.views[0]!.id); setFrameId(importedCharacter.views[0]!.frames[0]!.id); setLayerId(importedCharacter.layers[0]!.id);
      setVariantId(""); setPoseId("neutral"); setUndoStack([]); setRedoStack([]); setSelections([]); setNotice(`Converted ${file.name} to editable ${options.width} × ${options.height} source`);
    } finally { bitmap.close(); }
  };

  useEffect(() => {
    const handleDocumentShortcuts = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (command && key === "n") { event.preventDefault(); newDocument(); }
      if (command && key === "o") { event.preventDefault(); fileInput.current?.click(); }
      if (command && key === "s") { event.preventDefault(); downloadJson(project, `${slug(project.name)}.pixel.json`); }
      if (command && event.shiftKey && key === "e") { event.preventDefault(); setModal("export"); }
      if (command && key === "a") { event.preventDefault(); setSelections([{ kind: "rect", points: [{ x: 0, y: 0 }, { x: character.width - 1, y: character.height - 1 }] }]); }
      if (event.key === "]") { event.preventDefault(); setViewId(character.views[(character.views.findIndex((item) => item.id === view.id) + 1) % character.views.length]!.id); }
    };
    window.addEventListener("keydown", handleDocumentShortcuts);
    return () => window.removeEventListener("keydown", handleDocumentShortcuts);
  }, [project, character, view]);

  const menus = [
    { name: "File", items: [
      { label: "New 24 × 24", shortcut: "⌘N", action: newDocument },
      { label: "Open JSON", shortcut: "⌘O", action: () => fileInput.current?.click() },
      { label: "Import mascot image", action: () => setModal("import") },
      { label: "Save source", shortcut: "⌘S", action: () => downloadJson(project, `${slug(project.name)}.pixel.json`) },
      { label: "Export", shortcut: "⇧⌘E", action: () => setModal("export") },
    ] },
    { name: "Edit", items: [
      { label: "Undo", shortcut: "⌘Z", action: undo, disabled: !undoStack.length },
      { label: "Redo", shortcut: "⇧⌘Z", action: redo, disabled: !redoStack.length },
      { label: "Clear selections", shortcut: "Esc", action: () => setSelections([]) },
    ] },
    { name: "Sprite", items: [
      { label: "Next direction", shortcut: "]", action: () => setViewId(character.views[(character.views.findIndex((item) => item.id === view.id) + 1) % character.views.length]!.id) },
      { label: "Neutral pose", action: () => setPoseId("neutral") },
      { label: "Base variant", action: () => setVariantId("") },
    ] },
    { name: "Layer", items: [
      { label: "New layer", action: addLayer }, { label: "Duplicate layer", action: duplicateLayer },
      { label: "Delete layer", action: () => character.layers.length > 1 && execute({ type: "removeLayer", characterId: character.id, layerId: layer.id }, "Deleted layer"), disabled: character.layers.length <= 1 },
      { label: layer.groupId ? "Remove from group" : "Add to Parts group", action: () => execute({ type: "updateLayer", characterId: character.id, layerId: layer.id, patch: { groupId: layer.groupId ? "" : "parts" } }, "Updated layer group") },
    ] },
    { name: "Frame", items: [
      { label: "New blank frame", action: () => addFrame(false) }, { label: "Duplicate frame", action: () => addFrame(true) },
      { label: "Delete frame", action: () => view.frames.length > 1 && execute({ type: "removeFrame", characterId: character.id, viewId: view.id, frameId: frame.id }, "Deleted frame"), disabled: view.frames.length <= 1 },
    ] },
    { name: "Select", items: [
      { label: "Select all", shortcut: "⌘A", action: () => setSelections([{ kind: "rect", points: [{ x: 0, y: 0 }, { x: character.width - 1, y: character.height - 1 }] }]) },
      { label: "Deselect", shortcut: "Esc", action: () => setSelections([]) },
    ] },
    { name: "View", items: [
      { label: `${showTimeline ? "Hide" : "Show"} timeline`, shortcut: "Tab", action: () => setShowTimeline((value) => !value) },
      { label: `${showInspector ? "Hide" : "Show"} inspector`, action: () => setShowInspector((value) => !value) },
      { label: `${showGrid ? "Hide" : "Show"} pixel grid`, action: () => setShowGrid((value) => !value) },
    ] },
    { name: "Help", items: [
      { label: "Keyboard reference", action: () => setModal("help") },
      { label: "About PIX", action: () => setModal("about") },
    ] },
  ];

  return (
    <Tooltip.Provider delayDuration={450}>
      <main className={`studio ${showTimeline ? "" : "timeline-hidden"} ${showInspector ? "" : "inspector-hidden"}`} onPointerDown={() => menuOpen && setMenuOpen(null)}>
        <header className="menu-bar" onPointerDown={(event) => event.stopPropagation()}>
          <PixelWordmark />
          <nav aria-label="Application menu">
            {menus.map((menu) => <Menu key={menu.name} name={menu.name} open={menuOpen === menu.name} onOpen={() => setMenuOpen(menuOpen === menu.name ? null : menu.name)} items={menu.items.map((item) => ({ ...item, action: () => { item.action(); setMenuOpen(null); } }))} />)}
          </nav>
          <div className="document-title"><span>{project.name}</span><span>{character.width} × {character.height}</span></div>
        </header>

        <section className="context-bar" aria-label="Tool options">
          <strong>{tools.find((item) => item.id === tool)?.label}</strong>
          {(tool === "marquee" || tool === "lasso") && <div className="segment-control" aria-label="Selection mode">{(["replace", "add", "subtract"] as SelectionMode[]).map((mode) => <button key={mode} className={selectionMode === mode ? "active" : ""} onClick={() => setSelectionMode(mode)}>{mode}</button>)}</div>}
          {(tool === "pencil" || tool === "eraser") && <span className="context-note">1 px · pixel-perfect</span>}
          {tool === "move" && <span className="context-note">Moves the active semantic part on this cel</span>}
          <div className="mobile-panel-tabs"><button className={showTimeline ? "active" : ""} onClick={() => setShowTimeline((value) => !value)}>Timeline</button><button className={showInspector ? "active" : ""} onClick={() => setShowInspector((value) => !value)}>Inspector</button></div>
          <label className="zoom-control">Zoom <input aria-label="Canvas zoom" type="range" min="4" max="32" step="2" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><output>{zoom}×</output></label>
        </section>

        <aside className="tool-bar" aria-label="Drawing tools">
          <div className="color-stack" aria-label="Foreground and background colors">
            <button aria-label={`Foreground ${foreground}`} style={{ background: colorFor(project, foreground) }} onClick={() => setForeground(background)} />
            <button aria-label={`Background ${background}`} style={{ background: colorFor(project, background) }} onClick={() => setBackground(foreground)} />
          </div>
          <ToolButton label="Swap colors" shortcut="X" active={false} icon="swap" onClick={() => { setForeground(background); setBackground(foreground); }} />
          <div className="tool-rule" />
          {tools.map((item) => <ToolButton key={item.id} label={item.label} shortcut={item.key} icon={item.icon} active={tool === item.id} onClick={() => setTool(item.id)} />)}
          <div className="tool-spacer" />
          <ToolButton label="Pixel grid" shortcut="" icon="grid" active={showGrid} onClick={() => setShowGrid((value) => !value)} />
        </aside>

        <CanvasWorkspace
          character={character} rendered={rendered} onionFrames={onionFrames} zoom={zoom} showGrid={showGrid}
          tool={tool} selections={selections} onPaint={paintPixel} onMovePart={movePart} onSelection={commitSelection}
          onCursor={setCursor} onZoom={setZoom}
        />

        {showInspector && <Inspector project={project} character={character} view={view} frame={frame} layer={layer} rendered={rendered} variantId={variantId} poseId={poseId}
          onView={(id) => { setViewId(id); const first = character.views.find((item) => item.id === id)!.frames[0]!; setFrameId(first.id); setSelectedFrames([first.id]); }}
          onVariant={setVariantId} onPose={setPoseId} onPalette={(tokenId, color) => execute({ type: "replacePaletteToken", tokenId, color }, `Changed ${tokenId}`)}
        />}

        {showTimeline && <Timeline character={character} view={view} frame={frame} layer={layer} project={project} selectedFrames={selectedFrames} playing={playing} onionSkin={onionSkin} animationId={animationId}
          onPlaying={() => setPlaying((value) => !value)} onOnion={() => setOnionSkin((value) => !value)} onFrame={chooseFrame} onLayer={setLayerId}
          onAnimation={setAnimationId} onTicks={(ticksPerSecond) => execute({ type: "updateProject", patch: { ticksPerSecond } }, `Timeline ${ticksPerSecond} FPS`)}
          onLoop={(target, loop) => execute({ type: "updateAnimation", characterId: character.id, animationId: target, patch: { loop } }, loop ? "Loop enabled" : "Loop disabled")}
          onAddLayer={addLayer} onAddFrame={() => addFrame(true)}
          onLayerUpdate={(target, patch) => execute({ type: "updateLayer", characterId: character.id, layerId: target.id, patch }, `Updated ${target.name}`)}
          onLayerReorder={(fromIndex, toIndex) => execute({ type: "reorderLayer", characterId: character.id, fromIndex, toIndex }, "Reordered layer")}
          onFrameReorder={(fromIndex, toIndex) => execute({ type: "reorderFrame", characterId: character.id, viewId: view.id, fromIndex, toIndex }, "Reordered frame")}
          onCelSwap={(sourceFrameId, sourceLayerId, targetFrameId, targetLayerId) => execute({ type: "swapCels", characterId: character.id, viewId: view.id, sourceFrameId, sourceLayerId, targetFrameId, targetLayerId }, "Swapped cels")}
          onFrameUpdate={(target, patch) => execute({ type: "updateFrame", characterId: character.id, viewId: view.id, frameId: target.id, patch }, `Updated ${target.name}`)}
        />}

        <footer className="status-bar"><span>{notice}</span><span>x {cursor.x} · y {cursor.y}</span><span>{zoom}×</span><span>{tool}</span><span>{layer.name}</span><span>{frame.name}</span><span>{character.width} × {character.height}</span></footer>
        <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void importProject(event.target.files[0])} />
        <InfoDialog modal={modal} setModal={setModal} project={project} character={character} rendered={rendered} variantId={variantId} poseId={poseId} onImport={importMascot} />
      </main>
    </Tooltip.Provider>
  );
}

function Menu({ name, open, onOpen, items }: { name: string; open: boolean; onOpen(): void; items: Array<{ label: string; shortcut?: string; action(): void; disabled?: boolean }> }) {
  return <div className="menu-root"><button className={open ? "open" : ""} aria-haspopup="menu" aria-expanded={open} onClick={onOpen}>{name}</button>{open && <div className="menu-popover" role="menu">{items.map((item) => <button key={item.label} role="menuitem" disabled={item.disabled} onClick={item.action}><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}</div>}</div>;
}

function ToolButton({ label, shortcut, icon, active, onClick }: { label: string; shortcut: string; icon: IconName; active: boolean; onClick(): void }) {
  return <Tooltip.Root><Tooltip.Trigger asChild><button className={`tool-button ${active ? "active" : ""}`} aria-label={`${label}${shortcut ? ` (${shortcut})` : ""}`} aria-pressed={active} onClick={onClick}><PixelIcon name={icon} /></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip" side="right">{label}{shortcut && <kbd>{shortcut}</kbd>}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}

function PixelWordmark() {
  return <div className="wordmark" aria-label="PIX"><svg viewBox="0 0 54 14" role="img"><path d="M1 1h12v8H5v4H1zm4 3v2h4V4zM17 1h4v12h-4zM25 1h4v3h3V1h4v4h3V1h4v4h-3v4h3v4h-4v-3h-3v3h-4v-3h-3v3h-4V9h3V5h-3z" /></svg><span>source studio</span></div>;
}

function CanvasWorkspace({ character, rendered, onionFrames, zoom, showGrid, tool, selections, onPaint, onMovePart, onSelection, onCursor, onZoom }: {
  character: Character; rendered: RenderedFrame; onionFrames: { previous?: RenderedFrame; next?: RenderedFrame }; zoom: number; showGrid: boolean; tool: Tool; selections: SelectionShape[];
  onPaint(x: number, y: number, button: number, forcePick?: boolean): void; onMovePart(dx: number, dy: number): void; onSelection(selection: SelectionShape): void; onCursor(point: PixelPoint): void; onZoom(value: number): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: PixelPoint; last: PixelPoint; button: number; mode: "paint" | "select" | "move" | "pan"; panX?: number; panY?: number; points: PixelPoint[] } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState<SelectionShape | null>(null);
  const [space, setSpace] = useState(false);

  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === "Space") setSpace(true); };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpace(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    if (!canvas.current) return;
    drawScaledFrame(canvas.current, rendered, zoom, onionFrames, showGrid);
  }, [rendered, onionFrames, zoom, showGrid]);

  const locate = (event: ReactPointerEvent<HTMLCanvasElement>): PixelPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: clamp(Math.floor((event.clientX - bounds.left) / zoom), 0, character.width - 1), y: clamp(Math.floor((event.clientY - bounds.top) / zoom), 0, character.height - 1) };
  };
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = locate(event); onCursor(point);
    if (space) {
      drag.current = { start: { x: event.clientX, y: event.clientY }, last: point, button: event.button, mode: "pan", panX: pan.x, panY: pan.y, points: [] };
      return;
    }
    if (event.altKey || tool === "picker") { onPaint(point.x, point.y, event.button, true); return; }
    if (tool === "marquee" || tool === "lasso") {
      drag.current = { start: point, last: point, button: event.button, mode: "select", points: [point] };
      setDraft({ kind: tool === "marquee" ? "rect" : "lasso", points: [point, point] });
    } else if (tool === "move") drag.current = { start: point, last: point, button: event.button, mode: "move", points: [] };
    else {
      drag.current = { start: point, last: point, button: event.button, mode: "paint", points: [] };
      onPaint(point.x, point.y, event.button);
    }
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = locate(event); onCursor(point);
    const current = drag.current;
    if (!current) return;
    if (current.mode === "pan") { setPan({ x: (current.panX ?? 0) + event.clientX - current.start.x, y: (current.panY ?? 0) + event.clientY - current.start.y }); return; }
    if (point.x === current.last.x && point.y === current.last.y) return;
    current.last = point;
    if (current.mode === "paint") onPaint(point.x, point.y, current.button);
    if (current.mode === "select") {
      if (tool === "lasso") current.points.push(point);
      setDraft({ kind: tool === "lasso" ? "lasso" : "rect", points: tool === "lasso" ? [...current.points] : [current.start, point] });
    }
  };
  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current) return;
    if (current.mode === "move") onMovePart(current.last.x - current.start.x, current.last.y - current.start.y);
    if (current.mode === "select" && draft) onSelection(draft);
    setDraft(null); drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const wheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextZoom = clamp(zoom + (event.deltaY < 0 ? 2 : -2), 4, 32);
    if (nextZoom === zoom || !area.current) return;
    const bounds = area.current.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left - pan.x;
    const cursorY = event.clientY - bounds.top - pan.y;
    const ratio = nextZoom / zoom;
    setPan({ x: pan.x - cursorX * (ratio - 1), y: pan.y - cursorY * (ratio - 1) });
    onZoom(nextZoom);
  };
  return <section ref={area} className={`canvas-workspace tool-${tool} ${space ? "is-panning" : ""}`} aria-label="Pixel canvas" onWheel={wheel}>
    <div className="canvas-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
      <canvas ref={canvas} width={character.width * zoom} height={character.height * zoom} onContextMenu={(event) => event.preventDefault()} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} />
      <SelectionOverlay shapes={[...selections, ...(draft ? [draft] : [])]} zoom={zoom} />
    </div>
    <div className="canvas-axis axis-x">{character.width}px</div><div className="canvas-axis axis-y">{character.height}px</div>
  </section>;
}

function SelectionOverlay({ shapes, zoom }: { shapes: SelectionShape[]; zoom: number }) {
  return <svg className="selection-overlay" aria-hidden="true">{shapes.map((shape, index) => {
    if (shape.kind === "rect") {
      const [start, end = start] = shape.points; const x = Math.min(start!.x, end!.x) * zoom; const y = Math.min(start!.y, end!.y) * zoom;
      return <rect key={index} x={x} y={y} width={(Math.abs(start!.x - end!.x) + 1) * zoom} height={(Math.abs(start!.y - end!.y) + 1) * zoom} />;
    }
    return <polyline key={index} points={shape.points.map((point) => `${point.x * zoom + zoom / 2},${point.y * zoom + zoom / 2}`).join(" ")} />;
  })}</svg>;
}

function Inspector({ project, character, view, frame, layer, rendered, variantId, poseId, onView, onVariant, onPose, onPalette }: {
  project: PixelProject; character: Character; view: DirectionalView; frame: Frame; layer: Layer; rendered: RenderedFrame; variantId: string; poseId: string;
  onView(id: string): void; onVariant(id: string): void; onPose(id: string): void; onPalette(tokenId: string, color: string): void;
}) {
  const [tab, setTab] = useState<"views" | "source" | "agent" | "meta">("views");
  const cel = frame.cels[layer.id];
  const usage = project.characters.flatMap((item) => item.views).flatMap((item) => item.frames).flatMap((item) => Object.values(item.cels)).reduce<Record<string, number>>((counts, item) => { item.grid.cells.forEach((token) => { if (token) counts[token] = (counts[token] ?? 0) + 1; }); return counts; }, {});
  return <aside className="inspector" aria-label="Character inspector">
    <section className="preview-panel"><div className="panel-heading"><strong>Live preview</strong><span>{rendered.hash}</span></div><MiniCanvas rendered={rendered} size={132} /><div className="preview-data"><span>{view.name}</span><span>{frame.name}</span></div></section>
    <div className="inspector-tabs" role="tablist">{(["views", "source", "agent", "meta"] as const).map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
    {tab === "views" && <div className="inspector-scroll">
      <section><h2>Direction</h2><div className="turntable">{character.views.map((item) => {
        const targetFrame = item.frames[Math.min(item.frames.length - 1, view.frames.findIndex((candidate) => candidate.id === frame.id))] ?? item.frames[0]!;
        const preview = renderFrame(project, { characterId: character.id, viewId: item.id, frameId: targetFrame.id, ...(poseId ? { poseId } : {}), ...(variantId ? { variantId } : {}) });
        return <button key={item.id} className={item.id === view.id ? "active" : ""} onClick={() => onView(item.id)}><MiniCanvas rendered={preview} size={48} /><span>{item.name}</span></button>;
      })}</div></section>
      <section className="field-stack"><label>Variant<select value={variantId} onChange={(event) => onVariant(event.target.value)}><option value="">Base</option>{character.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Pose<select value={poseId} onChange={(event) => onPose(event.target.value)}>{character.poses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></section>
      <section><h2>Semantic palette</h2><div className="palette-grid">{project.palette.map((token) => <label key={token.id} title={`${token.name}: ${token.color}`}><input type="color" value={token.color.slice(0, 7)} onChange={(event) => onPalette(token.id, event.target.value)} /><span style={{ background: token.color }} /><b>{token.name}</b><small>{usage[token.id] ?? 0}px</small></label>)}</div></section>
    </div>}
    {tab === "source" && <div className="source-panel"><div><span>Active cel</span><strong>{view.id}/{frame.id}/{layer.id}</strong></div><pre>{JSON.stringify(cel ?? null, null, 2)}</pre></div>}
    {tab === "agent" && <AgentHandoff project={project} character={character} view={view} frame={frame} rendered={rendered} />}
    {tab === "meta" && <div className="meta-panel">{Object.entries(character.metadata).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}<div><span>anchors</span><strong>{Object.keys(character.anchors).join(", ")}</strong></div><div><span>inheritance</span><strong>{variantId ? `${variantId} affects ${Object.keys(usage).length} semantic colors` : "base source"}</strong></div></div>}
  </aside>;
}

function Timeline({ character, view, frame, layer, project, selectedFrames, playing, onionSkin, animationId, onPlaying, onOnion, onFrame, onLayer, onAddLayer, onAddFrame, onLayerUpdate, onLayerReorder, onFrameReorder, onFrameUpdate, onAnimation, onTicks, onLoop, onCelSwap }: {
  character: Character; view: DirectionalView; frame: Frame; layer: Layer; project: PixelProject; selectedFrames: string[]; playing: boolean; onionSkin: boolean; animationId: string;
  onPlaying(): void; onOnion(): void; onFrame(id: string, event: React.MouseEvent): void; onLayer(id: string): void; onAddLayer(): void; onAddFrame(): void;
  onLayerUpdate(layer: Layer, patch: Partial<Pick<Layer, "name" | "visible" | "locked" | "linked" | "zIndex" | "groupId">>): void;
  onLayerReorder(from: number, to: number): void; onFrameReorder(from: number, to: number): void; onFrameUpdate(frame: Frame, patch: Partial<Pick<Frame, "name" | "durationTicks">>): void;
  onAnimation(id: string): void; onTicks(value: number): void; onLoop(animationId: string, loop: boolean): void; onCelSwap(sourceFrameId: string, sourceLayerId: string, targetFrameId: string, targetLayerId: string): void;
}) {
  const orderedLayers = [...character.layers].sort((a, b) => b.zIndex - a.zIndex);
  const clips = character.animations.filter((item) => item.viewId === view.id);
  const activeClip = clips.find((item) => item.id === animationId) ?? clips[0];
  return <section className="timeline" aria-label="Animation timeline">
    <div className="timeline-toolbar">
      <div className="timeline-actions"><button aria-label={playing ? "Pause animation" : "Play animation"} className={playing ? "active" : ""} onClick={onPlaying}><PixelIcon name={playing ? "pause" : "play"} /></button><button aria-label="Toggle onion skin" aria-pressed={onionSkin} className={onionSkin ? "active" : ""} onClick={onOnion}><PixelIcon name="onion" /></button><button aria-label="Add layer" onClick={onAddLayer}><PixelIcon name="plus" /><span>Layer</span></button><button aria-label="Duplicate frame" onClick={onAddFrame}><PixelIcon name="plus" /><span>Frame</span></button></div>
      <div className="frame-properties"><label>Tag <select aria-label="Animation tag" value={activeClip?.id ?? ""} onChange={(event) => onAnimation(event.target.value)}>{clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}</select></label><button className={activeClip?.loop ? "active" : ""} aria-label="Loop animation" aria-pressed={activeClip?.loop ?? false} onClick={() => activeClip && onLoop(activeClip.id, !activeClip.loop)}>Loop</button><label>FPS <input aria-label="Timeline FPS" type="number" min="1" max="60" value={project.ticksPerSecond} onChange={(event) => onTicks(clamp(Number(event.target.value), 1, 60))} /></label><label>Ticks <input aria-label="Frame duration ticks" type="number" min="1" max="99" value={frame.durationTicks} onChange={(event) => onFrameUpdate(frame, { durationTicks: Math.max(1, Number(event.target.value)) })} /></label><span>{view.name}</span></div>
    </div>
    <div className="timeline-grid" style={{ gridTemplateColumns: `172px repeat(${view.frames.length}, 58px) minmax(16px, 1fr)` }}>
      <div className="timeline-corner">Layers / cels</div>
      {view.frames.map((item, index) => <button key={item.id} draggable className={`frame-header ${selectedFrames.includes(item.id) ? "selected" : ""}`} onClick={(event) => onFrame(item.id, event)} onDragStart={(event) => event.dataTransfer.setData("application/x-frame", String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("application/x-frame")); if (Number.isInteger(from)) onFrameReorder(from, index); }}><b>{index + 1}</b><span>{item.durationTicks}t</span></button>)}
      <div className="timeline-fill" />
      {orderedLayers.map((item) => {
        const originalIndex = character.layers.findIndex((candidate) => candidate.id === item.id);
        return <div className="timeline-row" key={item.id} style={{ gridColumn: `1 / ${view.frames.length + 3}`, display: "grid", gridTemplateColumns: `172px repeat(${view.frames.length}, 58px) minmax(16px, 1fr)` }}>
          <div className={`layer-cell ${item.id === layer.id ? "active" : ""}`} draggable onDragStart={(event) => event.dataTransfer.setData("application/x-layer", String(originalIndex))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("application/x-layer")); if (Number.isInteger(from)) onLayerReorder(from, originalIndex); }} onClick={() => onLayer(item.id)}>
            <button aria-label={`${item.visible ? "Hide" : "Show"} ${item.name}`} onClick={(event) => { event.stopPropagation(); onLayerUpdate(item, { visible: !item.visible }); }}><PixelIcon name="eye" /></button>
            <button aria-label={`${item.locked ? "Unlock" : "Lock"} ${item.name}`} className={item.locked ? "on" : ""} onClick={(event) => { event.stopPropagation(); onLayerUpdate(item, { locked: !item.locked }); }}><PixelIcon name="lock" /></button>
            <button aria-label={`${item.linked ? "Unlink" : "Link"} ${item.name}`} className={item.linked ? "on" : ""} onClick={(event) => { event.stopPropagation(); onLayerUpdate(item, { linked: !item.linked }); }}><PixelIcon name="link" /></button>
            <input aria-label={`Layer name ${item.name}`} value={item.name} onClick={(event) => event.stopPropagation()} onChange={(event) => onLayerUpdate(item, { name: event.target.value })} />
          </div>
          {view.frames.map((targetFrame) => <button key={targetFrame.id} draggable className={`cel ${targetFrame.id === frame.id && item.id === layer.id ? "active" : ""}`} onClick={(event) => { onLayer(item.id); onFrame(targetFrame.id, event); }} onDragStart={(event) => event.dataTransfer.setData("application/x-cel", JSON.stringify({ frameId: targetFrame.id, layerId: item.id }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const raw = event.dataTransfer.getData("application/x-cel"); if (!raw) return; const source = JSON.parse(raw) as { frameId: string; layerId: string }; onCelSwap(source.frameId, source.layerId, targetFrame.id, item.id); }}><CelThumb grid={targetFrame.cels[item.id]?.grid} palette={project} size={34} /><span>{targetFrame.cels[item.id]?.grid.cells.some(Boolean) ? "cel" : "empty"}</span></button>)}
          <div className="timeline-fill" />
        </div>;
      })}
    </div>
  </section>;
}

function AgentHandoff({ project, character, view, frame, rendered }: { project: PixelProject; character: Character; view: DirectionalView; frame: Frame; rendered: RenderedFrame }) {
  const [request, setRequest] = useState("Animate a clean two-frame idle with a subtle one-pixel body movement. Preserve the silhouette and palette.");
  const [copied, setCopied] = useState(false);
  const prompt = `Use the code-as-pixel-art MCP tools. Inspect and validate the attached project before editing. ${request}`;
  const payload = () => ({
    kind: "code-as-pixelart.agent-request/v1",
    request,
    instructions: ["Use semantic operations, not exported image edits.", "Preserve stable IDs and integer coordinates.", "Validate after edits and render the smallest affected animation."],
    active: { characterId: character.id, viewId: view.id, frameId: frame.id, frameHash: rendered.hash },
    project,
  });
  return <div className="agent-panel"><h2>Agent handoff</h2><p>Give an agent the source and a precise motion brief. Its edits return as normal cels, layers, and palette tokens.</p><label>Request<textarea aria-label="Agent animation request" rows={6} value={request} onChange={(event) => setRequest(event.target.value)} /></label><div className="agent-context"><span>Target</span><strong>{view.id}/{frame.id}</strong><span>Frame hash</span><code>{rendered.hash}</code></div><div className="agent-actions"><button onClick={() => downloadJson(payload(), `${slug(project.name)}.agent-request.json`)}>Download handoff</button><button onClick={() => void navigator.clipboard.writeText(prompt).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); })}>{copied ? "Copied" : "Copy agent prompt"}</button></div><small>For direct tool use, run the local <code>pix-mcp</code> server included with this project.</small></div>;
}

function InfoDialog({ modal, setModal, project, character, rendered, variantId, poseId, onImport }: { modal: Modal; setModal(value: Modal): void; project: PixelProject; character: Character; rendered: RenderedFrame; variantId: string; poseId: string; onImport(file: File, options: { width: number; height: number; colors: number; removeBackground: boolean }): Promise<void> }) {
  const [layout, setLayout] = useState<SheetLayout>("horizontal");
  const [scale, setScale] = useState(4);
  const [animationId, setAnimationId] = useState(character.animations[0]!.id);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [importSize, setImportSize] = useState(32);
  const [importColors, setImportColors] = useState(12);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [importing, setImporting] = useState(false);
  useEffect(() => { if (!character.animations.some((item) => item.id === animationId)) setAnimationId(character.animations[0]!.id); }, [character, animationId]);
  const exportFrame = () => downloadRendered(rendered, `${slug(character.name)}-${rendered.frameId}.png`, scale);
  const exportSheet = () => {
    const frames = renderAnimation(project, { characterId: character.id, animationId, ...(variantId ? { variantId } : {}), ...(poseId ? { poseId } : {}) });
    const sheet = packSpriteSheet(frames, layout);
    downloadPixels(sheet.pixels, sheet.width, sheet.height, `${slug(character.name)}-${animationId}.png`, scale);
  };
  const exportManifest = () => {
    const frames = renderAnimation(project, { characterId: character.id, animationId, ...(variantId ? { variantId } : {}), ...(poseId ? { poseId } : {}) });
    const sheet = packSpriteSheet(frames, layout);
    downloadJson(createManifest(project, character, animationId, frames, sheet), `${slug(character.name)}-${animationId}.json`);
  };
  const exportGif = () => {
    const clip = character.animations.find((item) => item.id === animationId)!;
    const frames = renderAnimation(project, { characterId: character.id, animationId, ...(variantId ? { variantId } : {}), ...(poseId ? { poseId } : {}) });
    const bytes = encodeGif(frames, { ticksPerSecond: project.ticksPerSecond, scale, loop: clip.loop });
    downloadBlob(new Blob([bytes.slice().buffer], { type: "image/gif" }), `${slug(character.name)}-${animationId}.gif`);
  };
  return <Dialog.Root open={modal !== null} onOpenChange={(open) => !open && setModal(null)}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content" aria-describedby={undefined}>
    {modal === "import" && <><Dialog.Title>Convert mascot image</Dialog.Title><div className="import-copy">Choose a PNG, JPEG, or WebP. PIX downsamples it into palette-token cells that remain editable one pixel at a time.</div><div className="import-fields"><label>Source image<input aria-label="Mascot image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /></label><label>Sprite size<input aria-label="Imported sprite size" type="number" min="8" max="256" value={importSize} onChange={(event) => setImportSize(clamp(Number(event.target.value), 8, 256))} /></label><label>Palette colors<input aria-label="Imported palette colors" type="number" min="2" max="64" value={importColors} onChange={(event) => setImportColors(clamp(Number(event.target.value), 2, 64))} /></label><label className="check-field"><input type="checkbox" checked={removeBackground} onChange={(event) => setRemoveBackground(event.target.checked)} />Remove edge background</label></div><div className="import-result">{imageFile ? `${imageFile.name} · ${Math.ceil(imageFile.size / 1024)} KB` : "No image selected"}</div><div className="dialog-actions"><button disabled={!imageFile || importing} onClick={() => imageFile && void (async () => { setImporting(true); try { await onImport(imageFile, { width: importSize, height: importSize, colors: importColors, removeBackground }); setModal(null); } finally { setImporting(false); } })()}>{importing ? "Converting…" : "Convert to source"}</button></div></>}
    {modal === "export" && <><Dialog.Title>Export source and sprites</Dialog.Title><div className="export-preview"><MiniCanvas rendered={rendered} size={144} /><div><strong>{character.name}</strong><span>{rendered.width} × {rendered.height}px · {rendered.hash}</span></div></div><div className="export-fields"><label>Animation<select value={animationId} onChange={(event) => setAnimationId(event.target.value)}>{character.animations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Sheet layout<select value={layout} onChange={(event) => setLayout(event.target.value as SheetLayout)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="packed">Packed</option></select></label><label>Integer scale<input type="number" min="1" max="16" value={scale} onChange={(event) => setScale(clamp(Number(event.target.value), 1, 16))} /></label></div><div className="dialog-actions"><button onClick={exportFrame}>PNG frame</button><button onClick={exportGif}>GIF animation</button><button onClick={exportSheet}>PNG sheet</button><button onClick={exportManifest}>JSON manifest</button><button onClick={() => downloadJson(project, `${slug(project.name)}.pixel.json`)}>Project source</button></div></>}
    {modal === "help" && <><Dialog.Title>Keyboard reference</Dialog.Title><div className="shortcut-list">{tools.map((item) => <div key={item.id}><span>{item.label}</span><kbd>{item.key}</kbd></div>)}<div><span>Temporary eyedropper</span><kbd>Alt + click</kbd></div><div><span>Pan canvas</span><kbd>Space + drag</kbd></div><div><span>Timeline</span><kbd>Tab</kbd></div><div><span>Zoom presets</span><kbd>1–6</kbd></div><div><span>Swap colors</span><kbd>X</kbd></div><div><span>Undo / redo</span><kbd>⌘Z / ⇧⌘Z</kbd></div></div></>}
    {modal === "about" && <><Dialog.Title>PIX is pixel art as source</Dialog.Title><div className="about-copy"><p>Characters are stable palettes, semantic parts, authored views, poses, variants, cels, and integer timing.</p><p>The PNG is an export. The structured project is the work.</p><code>schema v{project.schemaVersion} · deterministic renderer · {project.ticksPerSecond} ticks/s</code></div></>}
    <Dialog.Close className="dialog-close" aria-label="Close dialog">Close</Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function MiniCanvas({ rendered, size }: { rendered: RenderedFrame; size: number }) {
  const reference = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (reference.current) drawPreview(reference.current, rendered); }, [rendered]);
  return <canvas ref={reference} className="mini-canvas" width={rendered.width} height={rendered.height} style={{ width: size, height: size }} />;
}

function CelThumb({ grid, palette, size }: { grid: PixelGrid | undefined; palette: PixelProject; size: number }) {
  const reference = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = reference.current;
    if (!canvas || !grid) return;
    canvas.width = grid.width; canvas.height = grid.height;
    const context = canvas.getContext("2d")!; const image = context.createImageData(grid.width, grid.height);
    const colors = new Map(palette.palette.map((token) => [token.id, hexToRgba(token.color)]));
    grid.cells.forEach((token, index) => { if (!token) return; const color = colors.get(token); if (!color) return; image.data.set(color, index * 4); });
    context.putImageData(image, 0, 0);
  }, [grid, palette]);
  return <canvas ref={reference} className="cel-thumb" style={{ width: size, height: size }} />;
}

function drawScaledFrame(canvas: HTMLCanvasElement, frame: RenderedFrame, zoom: number, onionFrames: { previous?: RenderedFrame; next?: RenderedFrame }, showGrid: boolean): void {
  canvas.width = frame.width * zoom; canvas.height = frame.height * zoom;
  const context = canvas.getContext("2d")!; context.imageSmoothingEnabled = false;
  const checkerA = "#2a1d20"; const checkerB = "#322326";
  for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) { context.fillStyle = (x + y) % 2 ? checkerA : checkerB; context.fillRect(x * zoom, y * zoom, zoom, zoom); }
  if (onionFrames.previous) drawTintedPixels(context, onionFrames.previous, zoom, [151, 104, 111], 0.32);
  if (onionFrames.next) drawTintedPixels(context, onionFrames.next, zoom, [123, 139, 126], 0.28);
  drawPixels(context, frame, zoom);
  if (showGrid && zoom >= 10) {
    context.strokeStyle = "rgba(238, 216, 219, .09)"; context.lineWidth = 1; context.beginPath();
    for (let x = 1; x < frame.width; x += 1) { context.moveTo(x * zoom + .5, 0); context.lineTo(x * zoom + .5, canvas.height); }
    for (let y = 1; y < frame.height; y += 1) { context.moveTo(0, y * zoom + .5); context.lineTo(canvas.width, y * zoom + .5); }
    context.stroke();
  }
}

function drawPixels(context: CanvasRenderingContext2D, frame: RenderedFrame, zoom: number): void {
  for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) { const index = (y * frame.width + x) * 4; if (!frame.pixels[index + 3]) continue; context.fillStyle = `rgba(${frame.pixels[index]},${frame.pixels[index + 1]},${frame.pixels[index + 2]},${frame.pixels[index + 3]! / 255})`; context.fillRect(x * zoom, y * zoom, zoom, zoom); }
}

function drawTintedPixels(context: CanvasRenderingContext2D, frame: RenderedFrame, zoom: number, color: [number, number, number], alpha: number): void {
  context.fillStyle = `rgba(${color.join(",")},${alpha})`;
  for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) if (frame.pixels[(y * frame.width + x) * 4 + 3]) context.fillRect(x * zoom, y * zoom, zoom, zoom);
}

function drawPreview(canvas: HTMLCanvasElement, frame: RenderedFrame): void {
  canvas.width = frame.width; canvas.height = frame.height;
  const context = canvas.getContext("2d")!; context.imageSmoothingEnabled = false; const image = context.createImageData(frame.width, frame.height); image.data.set(frame.pixels); context.putImageData(image, 0, 0);
}

function downloadRendered(rendered: RenderedFrame, filename: string, scale: number): void { downloadPixels(rendered.pixels, rendered.width, rendered.height, filename, scale); }
function downloadPixels(pixels: Uint8ClampedArray, width: number, height: number, filename: string, scale: number): void {
  const source = document.createElement("canvas"); source.width = width; source.height = height; const sourceContext = source.getContext("2d")!; const image = sourceContext.createImageData(width, height); image.data.set(pixels); sourceContext.putImageData(image, 0, 0);
  const output = document.createElement("canvas"); output.width = width * scale; output.height = height * scale; const context = output.getContext("2d")!; context.imageSmoothingEnabled = false; context.drawImage(source, 0, 0, output.width, output.height);
  output.toBlob((blob) => { if (blob) downloadBlob(blob, filename); }, "image/png");
}
function downloadJson(data: unknown, filename: string): void { downloadBlob(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" }), filename); }
function downloadBlob(blob: Blob, filename: string): void { const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(anchor.href), 0); }
function colorFor(project: PixelProject, tokenId: string): string { return project.palette.find((token) => token.id === tokenId)?.color ?? "#000000"; }
function hexToRgba(color: string): [number, number, number, number] { return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16), color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) : 255]; }
function uniqueId(base: string, ids: string[]): string { let candidate = base; let count = 2; while (ids.includes(candidate)) candidate = `${base}-${count++}`; return candidate; }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function loadAutosave(): PixelProject | null { try { const value = window.localStorage.getItem("pix-project-v1"); if (!value) return null; const project = JSON.parse(value) as PixelProject; return validateProject(project).valid ? project : null; } catch { return null; } }
function shapesOverlap(a: SelectionShape, b: SelectionShape): boolean { const bounds = (shape: SelectionShape) => ({ minX: Math.min(...shape.points.map((point) => point.x)), maxX: Math.max(...shape.points.map((point) => point.x)), minY: Math.min(...shape.points.map((point) => point.y)), maxY: Math.max(...shape.points.map((point) => point.y)) }); const one = bounds(a); const two = bounds(b); return one.minX <= two.maxX && one.maxX >= two.minX && one.minY <= two.maxY && one.maxY >= two.minY; }
