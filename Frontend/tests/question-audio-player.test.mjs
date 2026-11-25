import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/question-audio-player.tsx", import.meta.url), "utf8");

// Execute component code, not a copy of its playback logic. Media models activation;
// this is deliberately not evidence of any particular real browser's autoplay policy.
function mount({ rejectPlay = false } = {}) {
  const trace = [];
  const hooks = [];
  const effects = [];
  let cursor = 0;
  let active = false;
  let tree;
  let props = { endpoint: "/mock/audio", src: "https://media.invalid/audio?signature=one" };
  let grant = "available";
  let reservedToken;
  const listeners = new Map();
  const audio = {
    muted: false, volume: 1, playbackRate: 1, readyState: 4, duration: 60,
    currentTime: 0, paused: true, src: "",
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    emit(name) { for (const callback of listeners.get(name) ?? []) callback({ type: name }); },
    getAttribute(name) { return this[name] || null; },
    removeAttribute(name) { this[name] = ""; },
    load() { trace.push({ type: "load" }); },
    pause() { this.paused = true; trace.push({ type: "pause" }); },
    play() {
      trace.push({ type: "play", muted: this.muted, active });
      if (rejectPlay || (!this.muted && !active)) {
        trace.push({ type: "rejected" });
        return Promise.reject(new Error("NotAllowedError: user activation required"));
      }
      this.paused = false;
      if (!this.muted) trace.push({ type: "audible" });
      queueMicrotask(() => { if (!this.paused) this.emit("playing"); });
      return Promise.resolve();
    },
  };
  const apiRequest = async (url, options = {}) => {
    const action = url.split("/").at(-1);
    trace.push({ type: "request", action });
    // In-memory server only: never fetch, never access DB.
    if (action === "reserve") {
      assert.equal(grant, "available");
      reservedToken = JSON.parse(options.body).token;
      grant = "reserved";
    } else if (action === "commit") {
      assert.equal(JSON.parse(options.body).token, reservedToken);
      grant = "used";
    } else if (action === "release") {
      assert.equal(JSON.parse(options.body).token, reservedToken);
      assert.notEqual(grant, "used", "consumed grant must not be released");
      grant = "available";
    }
    return { data: { status: grant, ...(grant === "reserved" ? { token: reservedToken } : {}) } };
  };
  const react = {
    useRef(value) {
      const index = cursor++;
      hooks[index] ??= { current: value };
      return hooks[index];
    },
    useState(value) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof value === "function" ? value() : value;
      return [hooks[index], next => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const compiledModule = { exports: {} };
  const window = new EventTarget();
  const context = vm.createContext({
    module: compiledModule, exports: compiledModule.exports, AbortController,
    HTMLMediaElement: { HAVE_ENOUGH_DATA: 4, HAVE_FUTURE_DATA: 3 },
    window, crypto: { randomUUID: () => "mock-reservation" }, performance,
    setTimeout: () => ({}), clearTimeout: () => {},
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/api") return { apiRequest, ApiError: class ApiError extends Error {} };
      if (name.endsWith(".module.css")) return { default: {} };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  vm.runInContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    return [node, ...[node.props?.children].flat(Infinity).filter(child => child != null).flatMap(child => nodes(child))];
  }
  function render(next = {}) {
    props = { ...props, ...next };
    cursor = 0;
    tree = compiledModule.exports.QuestionAudioPlayer(props);
    for (const node of nodes()) if (node.type === "audio" && node.props.ref) node.props.ref.current = audio;
    for (const effect of effects.splice(0)) effect();
  }
  async function settle() {
    // Drain bounded microtask turns, never wait on wall-clock timers/network.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    render();
  }
  function click() {
    const button = nodes().find(node => node.type === "button" && node.props.children?.includes?.("Putar audio"));
    assert.ok(button, "play button rendered");
    assert.equal(button.props.disabled, false, "play button enabled");
    active = true;
    try { button.props.onClick(); } finally { active = false; }
  }
  render();
  return {
    audio, trace, nodes, render, settle, click, window,
    get grant() { return grant; },
    cleanup() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test("click starts one unmuted play synchronously and commits only once", async t => {
  const player = mount();
  t.after(() => player.cleanup());
  await player.settle();
  assert.equal(player.grant, "reserved", "prepare reservation before click");
  assert.equal(player.trace.filter(event => event.type === "play").length, 0);
  player.click();
  assert.deepEqual(player.trace.filter(event => event.type === "play"), [
    { type: "play", muted: false, active: true },
  ], "play must occur inside click before any await");
  await player.settle();
  assert.equal(player.grant, "used");
  assert.equal(player.audio.paused, false);
  player.audio.emit("playing");
  player.audio.emit("playing");
  await player.settle();
  assert.equal(player.trace.filter(event => event.action === "commit").length, 1);
  assert.equal(player.trace.filter(event => event.type === "play").length, 1);
  assert.equal(player.trace.filter(event => event.type === "audible").length, 1);
  assert.ok(player.nodes().some(node => node.props.role === "status" && node.props["aria-live"] === "polite"));
});

test("rejected start releases reservation without consuming grant", async t => {
  const player = mount({ rejectPlay: true });
  t.after(() => player.cleanup());
  await player.settle();
  player.click();
  await player.settle();
  assert.equal(player.grant, "available");
  assert.equal(player.trace.filter(event => event.action === "release").length, 1);
  assert.equal(player.trace.filter(event => event.action === "commit").length, 0);
  assert.equal(player.audio.paused, true);
  assert.ok(player.nodes().some(node => node.type === "button" && node.props.children === "Coba Lagi"));
});

test("signed URL refresh leaves playback intact; volume stays accessible; cleanup stops media", async () => {
  const player = mount();
  try {
    await player.settle();
    const volume = player.nodes().find(node => node.type === "input" && node.props.type === "range");
    assert.ok(volume, "native range exposes slider role");
    assert.equal(volume.props["aria-label"], "Volume audio");
    assert.equal(volume.props.disabled, false);
    volume.props.onChange({ target: { value: "0.35" } });
    player.render();
    assert.equal(player.audio.volume, 0.35);
    player.click();
    await player.settle();
    const originalSrc = player.audio.src;
    const traceLength = player.trace.length;
    player.render({ src: "https://media.invalid/audio?signature=two" });
    await player.settle();
    assert.equal(player.audio.src, originalSrc);
    assert.equal(player.audio.paused, false);
    assert.equal(player.trace.length, traceLength, "URL refresh must not reload, pause, reserve or restart");
    player.audio.currentTime = 15;
    player.audio.emit("timeupdate");
    player.render();
    assert.equal(player.nodes().find(node => node.type === "progress").props.value, 15);
  } finally {
    player.cleanup();
  }
  assert.equal(player.audio.paused, true);
  assert.equal(player.audio.muted, true);
  assert.equal(player.audio.src, "");
});
