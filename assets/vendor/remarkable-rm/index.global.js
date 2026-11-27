"use strict";
var RemarkableRM = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/browser.ts
  var browser_exports = {};
  __export(browser_exports, {
    parse: () => parse,
    renderToSvg: () => renderToSvg
  });

  // src/parser/detect.ts
  var HEADER_LENGTH = 43;
  var HEADER_PREFIX = "reMarkable .lines file, version=";
  var VERSION_INDEX = 32;
  function detectVersion(data) {
    if (data.length < HEADER_LENGTH) {
      throw new Error(
        `Truncated input: expected at least ${HEADER_LENGTH} bytes, got ${data.length}`
      );
    }
    const header = new TextDecoder("ascii").decode(data.slice(0, HEADER_LENGTH));
    if (!header.startsWith(HEADER_PREFIX)) {
      throw new Error("Not a reMarkable .rm file: unrecognised header");
    }
    const versionChar = header[VERSION_INDEX];
    if (versionChar === "6") return 6;
    if (versionChar === "5") return 5;
    throw new Error(`Unsupported reMarkable file version: ${versionChar}`);
  }

  // src/parser/common/data-stream.ts
  var DataStream = class {
    view;
    position = 0;
    constructor(data) {
      this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    }
    /** Returns the current read position. */
    tell() {
      return this.position;
    }
    /** Repositions the cursor to the given offset. Throws RangeError if out of bounds. */
    seek(position) {
      if (position < 0 || position > this.view.byteLength) {
        throw new RangeError(
          `seek position ${position} is out of bounds (buffer length: ${this.view.byteLength})`
        );
      }
      this.position = position;
    }
    /** Returns the number of bytes remaining from the current position. */
    remaining() {
      return this.view.byteLength - this.position;
    }
    /** Reads exactly n bytes and advances the position. Throws RangeError if insufficient data. */
    readBytes(n) {
      this.assertRemaining(n);
      const result = new Uint8Array(this.view.buffer, this.view.byteOffset + this.position, n);
      this.position += n;
      return result.slice();
    }
    /** Reads one unsigned byte. Throws RangeError if at end of buffer. */
    readUint8() {
      this.assertRemaining(1);
      const value = this.view.getUint8(this.position);
      this.position += 1;
      return value;
    }
    /** Reads a little-endian unsigned 16-bit integer. Throws RangeError if insufficient data. */
    readUint16() {
      this.assertRemaining(2);
      const value = this.view.getUint16(this.position, true);
      this.position += 2;
      return value;
    }
    /** Reads a little-endian unsigned 32-bit integer. Throws RangeError if insufficient data. */
    readUint32() {
      this.assertRemaining(4);
      const value = this.view.getUint32(this.position, true);
      this.position += 4;
      return value;
    }
    /** Reads a little-endian IEEE 754 single-precision float. Throws RangeError if insufficient data. */
    readFloat32() {
      this.assertRemaining(4);
      const value = this.view.getFloat32(this.position, true);
      this.position += 4;
      return value;
    }
    /** Reads a little-endian IEEE 754 double-precision float. Throws RangeError if insufficient data. */
    readFloat64() {
      this.assertRemaining(8);
      const value = this.view.getFloat64(this.position, true);
      this.position += 8;
      return value;
    }
    /** Reads one byte and interprets it as a boolean (non-zero = true). */
    readBool() {
      return this.readUint8() !== 0;
    }
    /**
     * Reads a LEB128 variable-length unsigned integer.
     * Throws RangeError if the buffer ends before the integer is complete.
     */
    readVaruint() {
      let result = 0;
      let shift = 0;
      for (; ; ) {
        this.assertRemaining(1);
        const byte = this.view.getUint8(this.position);
        this.position += 1;
        result += (byte & 127) * 2 ** shift;
        shift += 7;
        if ((byte & 128) === 0) {
          break;
        }
      }
      return result;
    }
    assertRemaining(needed) {
      if (this.remaining() < needed) {
        throw new RangeError(
          `attempted to read ${needed} byte(s) but only ${this.remaining()} remain(s) at position ${this.position}`
        );
      }
    }
  };

  // src/parser/common/colours.ts
  var PEN_COLOUR_ID_MAP = {
    0: "black",
    1: "grey",
    2: "white",
    3: "yellow",
    4: "green",
    5: "pink",
    6: "blue",
    7: "red",
    8: "grey-overlap",
    9: "highlight",
    10: "green-2",
    11: "cyan",
    12: "magenta",
    13: "yellow-2"
  };
  var COLOUR_RGB_MAP = {
    black: { r: 0, g: 0, b: 0 },
    grey: { r: 144, g: 144, b: 144 },
    white: { r: 255, g: 255, b: 255 },
    yellow: { r: 251, g: 247, b: 25 },
    green: { r: 0, g: 255, b: 0 },
    pink: { r: 255, g: 192, b: 203 },
    blue: { r: 78, g: 105, b: 201 },
    red: { r: 179, g: 62, b: 57 },
    "grey-overlap": { r: 125, g: 125, b: 125 },
    highlight: { r: 255, g: 235, b: 59 },
    "green-2": { r: 161, g: 216, b: 125 },
    cyan: { r: 139, g: 208, b: 229 },
    magenta: { r: 183, g: 130, b: 205 },
    "yellow-2": { r: 247, g: 232, b: 81 }
  };
  function penColourFromId(id) {
    const colour = PEN_COLOUR_ID_MAP[id];
    if (colour === void 0) {
      throw new Error(`Unknown pen colour id: ${id}`);
    }
    return colour;
  }
  function resolveColour(penColour) {
    return COLOUR_RGB_MAP[penColour];
  }

  // src/parser/common/pens.ts
  var PEN_ID_MAP = {
    0: "paintbrush",
    1: "pencil",
    2: "ballpoint",
    3: "marker",
    4: "fineliner",
    5: "highlighter",
    6: "eraser",
    7: "mechanical-pencil",
    8: "eraser-area",
    12: "paintbrush",
    13: "mechanical-pencil",
    14: "pencil",
    15: "ballpoint",
    16: "marker",
    17: "fineliner",
    18: "highlighter",
    21: "calligraphy",
    23: "shader"
  };
  function penTypeFromId(id) {
    const penType = PEN_ID_MAP[id];
    if (penType === void 0) {
      throw new Error(`Unknown pen ID: ${id}`);
    }
    return penType;
  }

  // src/parser/v5/parser.ts
  var HEADER_LENGTH2 = 43;
  var STROKE_HEADER_BYTES = 24;
  var POINT_BYTES = 24;
  function assertCountFits(count, recordBytes, remaining, label) {
    if (count < 0 || !Number.isFinite(count) || count * recordBytes > remaining) {
      throw new Error(
        `${label} count ${count} would require ${count * recordBytes} bytes but only ${remaining} remain`
      );
    }
  }
  function parseV5(data) {
    const stream = new DataStream(data);
    stream.seek(HEADER_LENGTH2);
    const numLayers = stream.readUint32();
    assertCountFits(numLayers, 4, stream.remaining(), "v5 layer");
    const layers = [];
    for (let layerIndex = 0; layerIndex < numLayers; layerIndex++) {
      const numStrokes = stream.readUint32();
      assertCountFits(numStrokes, STROKE_HEADER_BYTES, stream.remaining(), "v5 stroke");
      const items = [];
      for (let strokeIndex = 0; strokeIndex < numStrokes; strokeIndex++) {
        const penTypeId = stream.readUint32();
        const colourId = stream.readUint32();
        stream.readUint32();
        const baseWidth = stream.readFloat32();
        stream.readUint32();
        const numPoints = stream.readUint32();
        assertCountFits(numPoints, POINT_BYTES, stream.remaining(), "v5 point");
        const pen = penTypeFromId(penTypeId);
        const penColour = penColourFromId(colourId);
        const colour = resolveColour(penColour);
        const points = [];
        for (let pointIndex = 0; pointIndex < numPoints; pointIndex++) {
          const x = stream.readFloat32();
          const y = stream.readFloat32();
          const speed = stream.readFloat32();
          const direction = stream.readFloat32();
          const width = stream.readFloat32();
          const pressure = stream.readFloat32();
          points.push({ x, y, speed, direction, width, pressure });
        }
        const stroke = {
          type: "stroke",
          pen,
          colour,
          penColour,
          thicknessScale: baseWidth,
          points
        };
        items.push(stroke);
      }
      layers.push({
        id: `layer-${layerIndex}`,
        visible: true,
        items
      });
    }
    return {
      version: 5,
      pages: [{ layers }]
    };
  }

  // src/parser/v6/block-reader.ts
  var TagType = {
    ID: 15,
    Length4: 12,
    Byte8: 8,
    Byte4: 4,
    Byte1: 1
  };
  function readCrdtId(stream) {
    const part1 = stream.readUint8();
    const part2 = stream.readVaruint();
    return { part1, part2 };
  }
  var TaggedBlockReader = class {
    stream;
    constructor(stream) {
      this.stream = stream;
    }
    // -------------------------------------------------------------------------
    // Tag reading
    // -------------------------------------------------------------------------
    /**
     * Reads the next varuint tag and verifies that it has the expected index and
     * type.  On failure the stream position is rewound to before the tag bytes
     * and an error is thrown.
     */
    readTag(expectedIndex, expectedType) {
      const before = this.stream.tell();
      const raw = this.stream.readVaruint();
      const index = raw >> 4;
      const type = raw & 15;
      if (index !== expectedIndex || type !== expectedType) {
        this.stream.seek(before);
        throw new Error(
          `Tag mismatch: expected index=${expectedIndex} type=${expectedType}, got index=${index} type=${type}`
        );
      }
    }
    /**
     * Peeks at the next tag without advancing the stream.
     * Returns true if it matches, false otherwise.
     */
    checkTag(expectedIndex, expectedType) {
      const before = this.stream.tell();
      try {
        this.readTag(expectedIndex, expectedType);
        return true;
      } catch {
        return false;
      } finally {
        this.stream.seek(before);
      }
    }
    // -------------------------------------------------------------------------
    // Value readers
    // -------------------------------------------------------------------------
    readId(index) {
      this.readTag(index, TagType.ID);
      return readCrdtId(this.stream);
    }
    readBool(index) {
      this.readTag(index, TagType.Byte1);
      return this.stream.readBool();
    }
    readByte(index) {
      this.readTag(index, TagType.Byte1);
      return this.stream.readUint8();
    }
    readInt(index) {
      this.readTag(index, TagType.Byte4);
      return this.stream.readUint32();
    }
    readFloat(index) {
      this.readTag(index, TagType.Byte4);
      return this.stream.readFloat32();
    }
    readDouble(index) {
      this.readTag(index, TagType.Byte8);
      return this.stream.readFloat64();
    }
    // -------------------------------------------------------------------------
    // Optional value readers
    // -------------------------------------------------------------------------
    readIntOptional(index) {
      if (!this.checkTag(index, TagType.Byte4)) return null;
      return this.readInt(index);
    }
    readByteOptional(index) {
      if (!this.checkTag(index, TagType.Byte1)) return null;
      return this.readByte(index);
    }
    readIdOptional(index) {
      if (!this.checkTag(index, TagType.ID)) return null;
      return this.readId(index);
    }
    // -------------------------------------------------------------------------
    // Block / subblock reading
    // -------------------------------------------------------------------------
    /** Returns null at EOF, otherwise reads the 8-byte block header. */
    readBlock() {
      if (this.stream.remaining() === 0) return null;
      const size = this.stream.readUint32();
      this.stream.readUint8();
      const minVersion = this.stream.readUint8();
      const currentVersion = this.stream.readUint8();
      const blockType = this.stream.readUint8();
      const offset = this.stream.tell();
      const info = {
        offset,
        size,
        blockType,
        minVersion,
        currentVersion
      };
      const end = () => {
        const expectedEnd = info.offset + info.size;
        const current = this.stream.tell();
        if (current < expectedEnd) {
          this.stream.seek(expectedEnd);
        } else if (current > expectedEnd) {
          this.stream.seek(expectedEnd);
        }
      };
      return { info, end };
    }
    /** Reads tag(Length4) + uint32 length, returns SubBlockInfo. */
    readSubblock(index) {
      this.readTag(index, TagType.Length4);
      const size = this.stream.readUint32();
      const offset = this.stream.tell();
      return { offset, size };
    }
    /** Skips any trailing bytes inside the subblock and seeks to its declared end. */
    endSubblock(info) {
      const expectedEnd = info.offset + info.size;
      const current = this.stream.tell();
      if (current !== expectedEnd) {
        this.stream.seek(expectedEnd);
      }
    }
    /** Returns true if the next tag is a Length4 tag for the given index. */
    hasSubblock(index) {
      return this.checkTag(index, TagType.Length4);
    }
    /** Returns the number of bytes remaining inside the current outer context. */
    bytesRemainingInBlock() {
      return this.stream.remaining();
    }
    // -------------------------------------------------------------------------
    // LWW value readers
    // -------------------------------------------------------------------------
    readLwwBool(index) {
      const sub = this.readSubblock(index);
      const timestamp = this.readId(1);
      const value = this.readBool(2);
      this.endSubblock(sub);
      return { timestamp, value };
    }
    readLwwByte(index) {
      const sub = this.readSubblock(index);
      const timestamp = this.readId(1);
      const value = this.readByte(2);
      this.endSubblock(sub);
      return { timestamp, value };
    }
    readLwwFloat(index) {
      const sub = this.readSubblock(index);
      const timestamp = this.readId(1);
      const value = this.readFloat(2);
      this.endSubblock(sub);
      return { timestamp, value };
    }
    readLwwId(index) {
      const sub = this.readSubblock(index);
      const timestamp = this.readId(1);
      const value = this.readId(2);
      this.endSubblock(sub);
      return { timestamp, value };
    }
    readLwwString(index) {
      const sub = this.readSubblock(index);
      const timestamp = this.readId(1);
      const value = this.readString(2);
      this.endSubblock(sub);
      return { timestamp, value };
    }
    // -------------------------------------------------------------------------
    // String readers
    // -------------------------------------------------------------------------
    /** Reads a subblock containing varuint length + bool isAscii + string bytes. */
    readString(index) {
      const sub = this.readSubblock(index);
      const length = this.stream.readVaruint();
      this.stream.readBool();
      const bytes = this.stream.readBytes(length);
      this.endSubblock(sub);
      return new TextDecoder("utf-8").decode(bytes);
    }
    /**
     * Reads a string subblock; optionally followed by a format int(2).
     * Returns the text and the format value (or null if absent).
     */
    readStringWithFormat(index) {
      const sub = this.readSubblock(index);
      const length = this.stream.readVaruint();
      this.stream.readBool();
      const bytes = this.stream.readBytes(length);
      const text = new TextDecoder("utf-8").decode(bytes);
      const format = this.readIntOptional(2);
      this.endSubblock(sub);
      return { text, format };
    }
  };

  // src/parser/v6/crdt.ts
  var START_SENTINEL = "__start";
  var END_SENTINEL = "__end";
  function idKey(id) {
    return `${id.part1}:${id.part2}`;
  }
  function isEndMarker(id) {
    return id.part1 === 0 && id.part2 === 0;
  }
  function topoSort(items) {
    if (items.length === 0) return [];
    const itemsByKey = /* @__PURE__ */ new Map();
    for (const item of items) {
      itemsByKey.set(idKey(item.itemId), item);
    }
    const resolveLeft = (id) => {
      if (isEndMarker(id) || !itemsByKey.has(idKey(id))) return START_SENTINEL;
      return idKey(id);
    };
    const resolveRight = (id) => {
      if (isEndMarker(id) || !itemsByKey.has(idKey(id))) return END_SENTINEL;
      return idKey(id);
    };
    const inDegree = /* @__PURE__ */ new Map();
    const dependents = /* @__PURE__ */ new Map();
    const ensureNode = (key) => {
      if (!inDegree.has(key)) inDegree.set(key, 0);
      if (!dependents.has(key)) dependents.set(key, []);
    };
    ensureNode(START_SENTINEL);
    ensureNode(END_SENTINEL);
    const seenEdges = /* @__PURE__ */ new Set();
    const addEdge = (from, to) => {
      const edgeKey = `${from}\0${to}`;
      if (seenEdges.has(edgeKey)) return;
      seenEdges.add(edgeKey);
      ensureNode(from);
      ensureNode(to);
      dependents.get(from).push(to);
      inDegree.set(to, inDegree.get(to) + 1);
    };
    for (const item of items) {
      const key = idKey(item.itemId);
      addEdge(resolveLeft(item.leftId), key);
      addEdge(key, resolveRight(item.rightId));
    }
    const queue = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }
    const result = [];
    let processed = 0;
    while (queue.length > 0) {
      queue.sort();
      const current = queue.shift();
      processed++;
      if (current === END_SENTINEL) {
      } else if (current !== START_SENTINEL) {
        result.push(current);
      }
      for (const next of dependents.get(current)) {
        const newDegree = inDegree.get(next) - 1;
        inDegree.set(next, newDegree);
        if (newDegree === 0) queue.push(next);
      }
    }
    if (processed < inDegree.size) {
      const remaining = [];
      for (const [node, degree] of inDegree) {
        if (degree > 0) remaining.push(node);
      }
      throw new Error(`Cyclic dependency detected in CRDT sequence: ${remaining.join(", ")}`);
    }
    return result.filter((key) => itemsByKey.has(key)).map((key) => itemsByKey.get(key));
  }
  var CrdtSequence = class {
    _items = [];
    _seen = /* @__PURE__ */ new Set();
    _byId = /* @__PURE__ */ new Map();
    constructor(items) {
      if (items) {
        for (const item of items) {
          this.add(item);
        }
      }
    }
    /** Adds an item. Throws on duplicate ID. */
    add(item) {
      const key = idKey(item.itemId);
      if (this._seen.has(key)) {
        throw new Error(`Duplicate CRDT item ID: ${key}`);
      }
      this._seen.add(key);
      this._items.push(item);
      this._byId.set(key, item);
    }
    /** Adds an item, returning false if the ID is already present. */
    tryAdd(item) {
      const key = idKey(item.itemId);
      if (this._seen.has(key)) return false;
      this._seen.add(key);
      this._items.push(item);
      this._byId.set(key, item);
      return true;
    }
    keys() {
      return topoSort(this._items).map((item) => item.itemId);
    }
    values() {
      return topoSort(this._items).map((item) => item.value);
    }
    get(id) {
      const key = idKey(id);
      const found = this._byId.get(key);
      if (!found) {
        throw new Error(`CRDT item not found: ${key}`);
      }
      return found.value;
    }
    sequenceItems() {
      return [...this._items];
    }
  };

  // src/parser/v6/text.ts
  var STYLE_CODE_MAP = {
    0: "plain",
    1: "plain",
    2: "heading",
    3: "bold",
    4: "bullet",
    5: "bullet2",
    6: "checkbox",
    7: "checkbox-checked",
    10: "numbered"
  };
  function styleFromCode(code) {
    return STYLE_CODE_MAP[code] ?? "plain";
  }
  var LINE_HEIGHTS = {
    plain: 70,
    heading: 150,
    bold: 70,
    bullet: 35,
    bullet2: 35,
    checkbox: 35,
    "checkbox-checked": 35,
    numbered: 35
  };
  var TEXT_TOP_Y = -88;
  function crdtKey(id) {
    return `${id.part1}:${id.part2}`;
  }
  function expandTextItems(items) {
    const expanded = [];
    for (const item of items) {
      if (item.deletedLength > 0) {
        for (let i = 0; i < item.deletedLength; i++) {
          expanded.push({
            itemId: { part1: item.itemId.part1, part2: item.itemId.part2 + i },
            leftId: i === 0 ? item.leftId : { part1: item.itemId.part1, part2: item.itemId.part2 + i - 1 },
            rightId: i === item.deletedLength - 1 ? item.rightId : { part1: item.itemId.part1, part2: item.itemId.part2 + i + 1 },
            deletedLength: 1,
            value: ""
          });
        }
      } else if (typeof item.value === "number") {
        expanded.push(item);
      } else if (typeof item.value === "string" && item.value.length > 0) {
        const chars = item.value;
        let leftId = item.leftId;
        for (let i = 0; i < chars.length; i++) {
          const itemId = { part1: item.itemId.part1, part2: item.itemId.part2 + i };
          const rightId = i === chars.length - 1 ? item.rightId : { part1: item.itemId.part1, part2: item.itemId.part2 + i + 1 };
          expanded.push({
            itemId,
            leftId,
            rightId,
            deletedLength: 0,
            value: chars[i]
          });
          leftId = itemId;
        }
      }
    }
    return expanded;
  }
  function parseTextDocument(items, styles, posX, posY, width) {
    const charItems = new CrdtSequence(expandTextItems(items.sequenceItems()));
    const keys = charItems.keys();
    const anchorPositions = /* @__PURE__ */ new Map();
    anchorPositions.set("0:281474976710654", posY + TEXT_TOP_Y);
    const paragraphs = [];
    let yPos = posY + TEXT_TOP_Y;
    let idx = 0;
    while (idx < keys.length) {
      let flushSpan2 = function() {
        if (currentText.length > 0) {
          const span = { text: currentText };
          if (bold) span.bold = true;
          if (italic) span.italic = true;
          if (strikethrough) span.strikethrough = true;
          spans.push(span);
          currentText = "";
        }
      };
      var flushSpan = flushSpan2;
      let startId;
      const firstValue = charItems.get(keys[idx]);
      if (firstValue === "\n") {
        startId = keys[idx];
        anchorPositions.set(crdtKey(startId), yPos);
        idx++;
      } else {
        startId = { part1: 0, part2: 0 };
      }
      const spans = [];
      let currentText = "";
      let bold = false;
      let italic = false;
      let strikethrough = false;
      while (idx < keys.length) {
        const value = charItems.get(keys[idx]);
        if (value === "\n") break;
        if (typeof value === "number") {
          flushSpan2();
          switch (value) {
            case 1:
              bold = true;
              break;
            case 2:
              bold = false;
              break;
            case 3:
              italic = true;
              break;
            case 4:
              italic = false;
              break;
            case 5:
              strikethrough = true;
              break;
            case 6:
              strikethrough = false;
              break;
          }
        } else if (typeof value === "string") {
          currentText += value;
          anchorPositions.set(crdtKey(keys[idx]), yPos);
        }
        idx++;
      }
      flushSpan2();
      const styleKey = crdtKey(startId);
      const styleLww = styles.get(styleKey);
      const style = styleLww ? styleFromCode(styleLww.value) : "plain";
      anchorPositions.set(styleKey, yPos);
      yPos += LINE_HEIGHTS[style] ?? 70;
      paragraphs.push({ style, spans });
    }
    anchorPositions.set("0:281474976710655", yPos);
    const text = {
      type: "text",
      paragraphs,
      position: { x: posX, y: posY },
      width
    };
    return { text, anchorPositions };
  }

  // src/parser/v6/parser.ts
  var BLOCK_MIGRATION_INFO = 0;
  var BLOCK_SCENE_TREE = 1;
  var BLOCK_TREE_NODE = 2;
  var BLOCK_SCENE_GLYPH_ITEM = 3;
  var BLOCK_SCENE_GROUP_ITEM = 4;
  var BLOCK_SCENE_LINE_ITEM = 5;
  var BLOCK_SCENE_TEXT_ITEM = 6;
  var BLOCK_ROOT_TEXT = 7;
  var BLOCK_SCENE_TOMBSTONE_ITEM = 8;
  var BLOCK_AUTHOR_IDS = 9;
  var BLOCK_PAGE_INFO = 10;
  var BLOCK_SCENE_INFO = 13;
  function crdtKey2(id) {
    return `${id.part1}:${id.part2}`;
  }
  function isRecoverableParseError(err) {
    if (err instanceof RangeError) return true;
    if (err instanceof Error) {
      const msg = err.message;
      return msg.startsWith("Tag mismatch:") || msg.startsWith("Unknown pen ID:") || msg.startsWith("Unknown pen colour id:") || msg.startsWith("v6 ");
    }
    return false;
  }
  var POINT_SIZE_V2 = 14;
  var POINT_SIZE_V1 = 24;
  function parseV6Point(stream, version) {
    if (version === 2) {
      const x = stream.readFloat32();
      const y = stream.readFloat32();
      const speed = stream.readUint16();
      const width = stream.readUint16();
      const direction = stream.readUint8();
      const pressure = stream.readUint8();
      return { x, y, speed, width, direction, pressure };
    } else {
      const x = stream.readFloat32();
      const y = stream.readFloat32();
      const speedRaw = stream.readFloat32();
      const directionRaw = stream.readFloat32();
      const widthRaw = stream.readFloat32();
      const pressureRaw = stream.readFloat32();
      const speed = Math.round(speedRaw * 4);
      const direction = Math.round(255 * directionRaw / (2 * Math.PI));
      const width = Math.round(widthRaw * 4);
      const pressure = Math.round(pressureRaw * 255);
      return { x, y, speed, direction, width, pressure };
    }
  }
  function parseLine(reader, stream, blockVersion) {
    const penId = reader.readInt(1);
    const colourId = reader.readInt(2);
    const thicknessScale = reader.readDouble(3);
    reader.readFloat(4);
    const pointsSub = reader.readSubblock(5);
    const pointSize = blockVersion >= 2 ? POINT_SIZE_V2 : POINT_SIZE_V1;
    const numPoints = Math.floor(pointsSub.size / pointSize);
    if (numPoints < 0 || numPoints * pointSize > stream.remaining()) {
      throw new Error(`v6 point count ${numPoints} exceeds remaining ${stream.remaining()} bytes`);
    }
    const points = [];
    for (let i = 0; i < numPoints; i++) {
      points.push(parseV6Point(stream, blockVersion >= 2 ? 2 : 1));
    }
    reader.endSubblock(pointsSub);
    reader.readIdOptional(6);
    reader.readIdOptional(7);
    const rgbaOverride = reader.readIntOptional(8);
    const pen = penTypeFromId(penId);
    const penColour = penColourFromId(colourId);
    let colour = resolveColour(penColour);
    if (rgbaOverride !== null) {
      const b = rgbaOverride & 255;
      const g = rgbaOverride >>> 8 & 255;
      const r = rgbaOverride >>> 16 & 255;
      const a = rgbaOverride >>> 24 & 255;
      colour = { r, g, b, a };
    }
    return {
      type: "stroke",
      pen,
      colour,
      penColour,
      thicknessScale,
      points
    };
  }
  function parseGlyphRange(reader, stream) {
    reader.readIntOptional(2);
    reader.readIntOptional(3);
    const colourId = reader.readInt(4);
    const text = reader.readString(5);
    const rectsSub = reader.readSubblock(6);
    const numRects = stream.readVaruint();
    if (numRects * 32 > stream.remaining()) {
      throw new Error(
        `v6 highlight rect count ${numRects} exceeds remaining ${stream.remaining()} bytes`
      );
    }
    const rectangles = [];
    for (let i = 0; i < numRects; i++) {
      const x = stream.readFloat64();
      const y = stream.readFloat64();
      const width = stream.readFloat64();
      const height = stream.readFloat64();
      rectangles.push({ x, y, width, height });
    }
    reader.endSubblock(rectsSub);
    reader.readIdOptional(7);
    reader.readIdOptional(8);
    reader.readByteOptional(9);
    const rgbaOverride = reader.readIntOptional(10);
    const penColour = penColourFromId(colourId);
    let colour = resolveColour(penColour);
    if (rgbaOverride !== null) {
      const b = rgbaOverride & 255;
      const g = rgbaOverride >>> 8 & 255;
      const r = rgbaOverride >>> 16 & 255;
      colour = { r, g, b };
    }
    return {
      type: "highlight",
      colour,
      rectangles,
      text
    };
  }
  function parseRootTextBlock(reader, stream) {
    const blockId = reader.readId(1);
    const outerSub = reader.readSubblock(2);
    const itemsOuter = reader.readSubblock(1);
    const itemsInner = reader.readSubblock(1);
    const numItems = stream.readVaruint();
    if (numItems > stream.remaining()) {
      throw new Error(
        `v6 root-text item count ${numItems} exceeds remaining ${stream.remaining()} bytes`
      );
    }
    const items = new CrdtSequence();
    for (let i = 0; i < numItems; i++) {
      const itemSub = reader.readSubblock(0);
      const itemId = reader.readId(2);
      const leftId = reader.readId(3);
      const rightId = reader.readId(4);
      const deletedLength = reader.readInt(5);
      let value = "";
      if (deletedLength > 0) {
        value = "";
      } else if (reader.hasSubblock(6)) {
        const { text, format } = reader.readStringWithFormat(6);
        value = format !== null ? format : text;
      }
      reader.endSubblock(itemSub);
      const seqItem = {
        itemId,
        leftId,
        rightId,
        deletedLength,
        value
      };
      items.add(seqItem);
    }
    reader.endSubblock(itemsInner);
    reader.endSubblock(itemsOuter);
    const stylesOuter = reader.readSubblock(2);
    const stylesInner = reader.readSubblock(1);
    const numFormats = stream.readVaruint();
    if (numFormats > stream.remaining()) {
      throw new Error(
        `v6 root-text format count ${numFormats} exceeds remaining ${stream.remaining()} bytes`
      );
    }
    const styles = /* @__PURE__ */ new Map();
    for (let i = 0; i < numFormats; i++) {
      const formatId = readCrdtId(stream);
      const timestamp = reader.readId(1);
      const formatSub = reader.readSubblock(2);
      stream.readUint8();
      const formatCode = stream.readUint8();
      reader.endSubblock(formatSub);
      styles.set(crdtKey2(formatId), { timestamp, value: formatCode });
    }
    reader.endSubblock(stylesInner);
    reader.endSubblock(stylesOuter);
    reader.endSubblock(outerSub);
    const posSub = reader.readSubblock(3);
    const posX = stream.readFloat64();
    const posY = stream.readFloat64();
    reader.endSubblock(posSub);
    const width = reader.readFloat(4);
    return { blockId, items, styles, posX, posY, width };
  }
  function parseV6(data) {
    const stream = new DataStream(data);
    stream.seek(43);
    const reader = new TaggedBlockReader(stream);
    const rootNodeId = { part1: 0, part2: 1 };
    const nodes = /* @__PURE__ */ new Map();
    const sceneTreeParents = /* @__PURE__ */ new Map();
    const rootText = [];
    const rootNode = {
      nodeId: rootNodeId,
      label: null,
      visible: null,
      anchorId: null,
      anchorOriginX: null,
      children: new CrdtSequence()
    };
    nodes.set(crdtKey2(rootNodeId), rootNode);
    for (; ; ) {
      const block = reader.readBlock();
      if (block === null) break;
      const { info, end } = block;
      try {
        switch (info.blockType) {
          case BLOCK_SCENE_TREE: {
            reader.readId(1);
            const nodeId = reader.readId(2);
            reader.readBool(3);
            const parentSub = reader.readSubblock(4);
            const parentId = reader.readId(1);
            reader.endSubblock(parentSub);
            const key = crdtKey2(nodeId);
            if (!nodes.has(key)) {
              nodes.set(key, {
                nodeId,
                label: null,
                visible: null,
                anchorId: null,
                anchorOriginX: null,
                children: new CrdtSequence()
              });
            }
            sceneTreeParents.set(key, parentId);
            break;
          }
          case BLOCK_TREE_NODE: {
            const nodeId = reader.readId(1);
            const label = reader.readLwwString(2);
            const visible = reader.readLwwBool(3);
            let anchorId = null;
            let anchorOriginX = null;
            if (reader.hasSubblock(7)) {
              anchorId = reader.readLwwId(7);
            }
            if (reader.hasSubblock(8)) {
              reader.readLwwByte(8);
            }
            if (reader.hasSubblock(9)) {
              reader.readLwwFloat(9);
            }
            if (reader.hasSubblock(10)) {
              anchorOriginX = reader.readLwwFloat(10);
            }
            const key = crdtKey2(nodeId);
            if (!nodes.has(key)) {
              nodes.set(key, {
                nodeId,
                label: null,
                visible: null,
                anchorId: null,
                anchorOriginX: null,
                children: new CrdtSequence()
              });
            }
            const node = nodes.get(key);
            node.label = label;
            node.visible = visible;
            node.anchorId = anchorId;
            node.anchorOriginX = anchorOriginX;
            break;
          }
          case BLOCK_SCENE_LINE_ITEM: {
            const parentId = reader.readId(1);
            const itemId = reader.readId(2);
            const leftId = reader.readId(3);
            const rightId = reader.readId(4);
            const deletedLength = reader.readInt(5);
            let sceneItem = null;
            if (reader.hasSubblock(6)) {
              const itemSub = reader.readSubblock(6);
              stream.readUint8();
              const stroke = parseLine(reader, stream, info.currentVersion);
              reader.endSubblock(itemSub);
              sceneItem = { kind: "line", stroke };
            }
            if (sceneItem !== null) {
              const parentKey = crdtKey2(parentId);
              const parentNode = nodes.get(parentKey);
              if (parentNode) {
                const seqItem = {
                  itemId,
                  leftId,
                  rightId,
                  deletedLength,
                  value: sceneItem
                };
                parentNode.children.tryAdd(seqItem);
              }
            }
            break;
          }
          case BLOCK_SCENE_GROUP_ITEM: {
            const parentId = reader.readId(1);
            const itemId = reader.readId(2);
            const leftId = reader.readId(3);
            const rightId = reader.readId(4);
            const deletedLength = reader.readInt(5);
            let nodeRef = null;
            if (reader.hasSubblock(6)) {
              const itemSub = reader.readSubblock(6);
              stream.readUint8();
              nodeRef = reader.readId(2);
              reader.endSubblock(itemSub);
            }
            if (nodeRef !== null) {
              const parentKey = crdtKey2(parentId);
              const parentNode = nodes.get(parentKey);
              if (parentNode) {
                const sceneItem = { kind: "group", nodeRef };
                const seqItem = {
                  itemId,
                  leftId,
                  rightId,
                  deletedLength,
                  value: sceneItem
                };
                parentNode.children.tryAdd(seqItem);
              }
            }
            break;
          }
          case BLOCK_SCENE_GLYPH_ITEM: {
            const parentId = reader.readId(1);
            const itemId = reader.readId(2);
            const leftId = reader.readId(3);
            const rightId = reader.readId(4);
            const deletedLength = reader.readInt(5);
            let highlight = null;
            if (reader.hasSubblock(6)) {
              const itemSub = reader.readSubblock(6);
              stream.readUint8();
              highlight = parseGlyphRange(reader, stream);
              reader.endSubblock(itemSub);
            }
            if (highlight !== null) {
              const parentKey = crdtKey2(parentId);
              const parentNode = nodes.get(parentKey);
              if (parentNode) {
                const sceneItem = { kind: "glyph", highlight };
                const seqItem = {
                  itemId,
                  leftId,
                  rightId,
                  deletedLength,
                  value: sceneItem
                };
                parentNode.children.tryAdd(seqItem);
              }
            }
            break;
          }
          case BLOCK_ROOT_TEXT: {
            try {
              const rtData = parseRootTextBlock(reader, stream);
              rootText.push(rtData);
            } catch (err) {
              if (!isRecoverableParseError(err)) throw err;
            }
            break;
          }
          case BLOCK_MIGRATION_INFO:
          case BLOCK_SCENE_TEXT_ITEM:
          case BLOCK_SCENE_TOMBSTONE_ITEM:
          case BLOCK_AUTHOR_IDS:
          case BLOCK_PAGE_INFO:
          case BLOCK_SCENE_INFO:
          default:
            break;
        }
      } catch (err) {
        if (!isRecoverableParseError(err)) {
          end();
          throw err;
        }
      }
      end();
    }
    function convertNode(node) {
      const items = [];
      const children = node.children.sequenceItems();
      for (const seqItem of children) {
        if (seqItem.deletedLength > 0) continue;
        const child = seqItem.value;
        if (child.kind === "line") {
          items.push(child.stroke);
        } else if (child.kind === "glyph") {
          items.push(child.highlight);
        } else if (child.kind === "group") {
          const childNodeKey = crdtKey2(child.nodeRef);
          const childNode = nodes.get(childNodeKey);
          if (childNode) {
            const groupItems = convertNode(childNode);
            const group = {
              type: "group",
              items: groupItems
            };
            if (childNode.anchorId) {
              group.anchorId = crdtKey2(childNode.anchorId.value);
            }
            if (childNode.anchorOriginX) {
              group.anchorOriginX = childNode.anchorOriginX.value;
            }
            items.push(group);
          }
        }
      }
      return items;
    }
    const layers = [];
    const rootNodeInfo = nodes.get(crdtKey2(rootNodeId));
    if (rootNodeInfo) {
      const layerSeqItems = rootNodeInfo.children.sequenceItems();
      let layerIndex = 0;
      for (const seqItem of layerSeqItems) {
        if (seqItem.deletedLength > 0) continue;
        const child = seqItem.value;
        if (child.kind === "group") {
          const layerNodeKey = crdtKey2(child.nodeRef);
          const layerNode = nodes.get(layerNodeKey);
          if (layerNode) {
            const layerItems = convertNode(layerNode);
            const isVisible = layerNode.visible?.value ?? true;
            const layerId = layerNode.label?.value ?? `layer-${layerIndex}`;
            layers.push({
              id: layerId,
              visible: isVisible,
              items: layerItems
            });
            layerIndex++;
          }
        }
      }
    }
    let pageRootText = void 0;
    let anchorPositions = void 0;
    if (rootText.length > 0) {
      const rt = rootText[0];
      try {
        const result = parseTextDocument(rt.items, rt.styles, rt.posX, rt.posY, rt.width);
        pageRootText = result.text;
        anchorPositions = result.anchorPositions;
      } catch (err) {
        if (!isRecoverableParseError(err)) throw err;
      }
    }
    const page = { layers };
    if (pageRootText !== void 0) {
      page.rootText = pageRootText;
    }
    if (anchorPositions !== void 0) {
      page._anchorPositions = anchorPositions;
    }
    return {
      version: 6,
      pages: [page]
    };
  }

  // src/renderer/pens.ts
  function clamp(value) {
    return Math.min(Math.max(value, 0), 1);
  }
  function directionToTilt(direction) {
    return direction * Math.PI * 2 / 255;
  }
  function basePen(baseColour, baseWidth) {
    return {
      segmentLength: 1e3,
      baseOpacity: 1,
      strokeLinecap: "round",
      getSegmentWidth(_speed, _direction, _width, _pressure, _lastWidth) {
        return baseWidth;
      },
      getSegmentColour(_speed, _direction, _width, _pressure, _lastWidth) {
        return baseColour;
      },
      getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
        return 1;
      }
    };
  }
  function createPen(penType, baseColour, baseWidth) {
    switch (penType) {
      case "fineliner": {
        const effectiveWidth = baseWidth * 1.8;
        const base = basePen(baseColour, effectiveWidth);
        return base;
      }
      case "ballpoint": {
        return {
          segmentLength: 5,
          baseOpacity: 1,
          strokeLinecap: "round",
          getSegmentWidth(speed, _direction, width, pressure, _lastWidth) {
            return 0.5 + pressure / 255 + width / 4 - 0.5 * (speed / 4 / 50);
          },
          getSegmentColour(speed, _direction, _width, pressure, _lastWidth) {
            let intensity = 0.1 * -(speed / 4 / 35) + 1.2 * (pressure / 255) + 0.5;
            intensity = clamp(intensity);
            const fade = Math.abs(intensity - 1);
            const cap = 60 / 255;
            const t = Math.min(fade, cap);
            return {
              r: Math.round(baseColour.r + (255 - baseColour.r) * t),
              g: Math.round(baseColour.g + (255 - baseColour.g) * t),
              b: Math.round(baseColour.b + (255 - baseColour.b) * t)
            };
          },
          getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
            return 1;
          }
        };
      }
      case "marker": {
        return {
          segmentLength: 3,
          baseOpacity: 1,
          strokeLinecap: "round",
          getSegmentWidth(_speed, direction, width, _pressure, lastWidth) {
            return 0.9 * (width / 4 - 0.4 * directionToTilt(direction)) + 0.1 * lastWidth;
          },
          getSegmentColour(_speed, _direction, _width, _pressure, _lastWidth) {
            return baseColour;
          },
          getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
            return 1;
          }
        };
      }
      case "pencil": {
        return {
          segmentLength: 2,
          baseOpacity: 1,
          strokeLinecap: "round",
          getSegmentWidth(speed, direction, width, pressure, _lastWidth) {
            const w = 0.7 * ((0.8 * baseWidth + 0.5 * (pressure / 255)) * (width / 4) - 0.25 * Math.pow(directionToTilt(direction), 1.8) - 0.6 * (speed / 4 / 50));
            return Math.min(w, baseWidth * 10);
          },
          getSegmentColour(_speed, _direction, _width, _pressure, _lastWidth) {
            return baseColour;
          },
          getSegmentOpacity(speed, _direction, _width, pressure, _lastWidth) {
            const opacity = 0.1 * -(speed / 4 / 35) + 1 * (pressure / 255);
            return clamp(opacity) - 0.1;
          }
        };
      }
      case "mechanical-pencil": {
        const effectiveWidth = baseWidth ** 2;
        return {
          segmentLength: 1e3,
          baseOpacity: 0.7,
          strokeLinecap: "round",
          getSegmentWidth(_speed, _direction, _width, _pressure, _lastWidth) {
            return effectiveWidth;
          },
          getSegmentColour(_speed, _direction, _width, _pressure, _lastWidth) {
            return baseColour;
          },
          getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
            return 1;
          }
        };
      }
      case "paintbrush": {
        return {
          segmentLength: 2,
          baseOpacity: 1,
          strokeLinecap: "round",
          getSegmentWidth(speed, direction, width, pressure, _lastWidth) {
            return 0.5 * ((1 + 1.4 * (pressure / 255)) * (width / 4) - 0.5 * directionToTilt(direction) - speed / 4 / 50);
          },
          getSegmentColour(speed, _direction, _width, pressure, _lastWidth) {
            let intensity = (Math.pow(pressure / 255, 1.5) - 0.2 * (speed / 4 / 50)) * 1.5;
            intensity = clamp(intensity);
            const fade = 1 - intensity;
            return {
              r: Math.round(baseColour.r + (255 - baseColour.r) * fade),
              g: Math.round(baseColour.g + (255 - baseColour.g) * fade),
              b: Math.round(baseColour.b + (255 - baseColour.b) * fade)
            };
          },
          getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
            return 1;
          }
        };
      }
      case "highlighter": {
        return {
          segmentLength: 1e3,
          baseOpacity: 1,
          strokeLinecap: "square",
          getSegmentWidth(_speed, _direction, width, _pressure, _lastWidth) {
            return width / 4;
          },
          getSegmentColour(_speed, _direction, _width, _pressure, _lastWidth) {
            return { r: baseColour.r, g: baseColour.g, b: baseColour.b };
          },
          getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
            return 1;
          }
        };
      }
      case "eraser": {
        const effectiveWidth = baseWidth * 2;
        const white = { r: 255, g: 255, b: 255 };
        return {
          segmentLength: 1e3,
          baseOpacity: 1,
          strokeLinecap: "square",
          getSegmentWidth(_speed, _direction, _width, _pressure, _lastWidth) {
            return effectiveWidth;
          },
          getSegmentColour(_speed, _direction, _width, _pressure, _lastWidth) {
            return white;
          },
          getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
            return 1;
          }
        };
      }
      case "eraser-area": {
        return {
          segmentLength: 1e3,
          baseOpacity: 0,
          strokeLinecap: "square",
          getSegmentWidth(_speed, _direction, _width, _pressure, _lastWidth) {
            return baseWidth;
          },
          getSegmentColour(_speed, _direction, _width, _pressure, _lastWidth) {
            return baseColour;
          },
          getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
            return 1;
          }
        };
      }
      case "calligraphy": {
        return {
          segmentLength: 2,
          baseOpacity: 1,
          strokeLinecap: "round",
          getSegmentWidth(_speed, direction, width, pressure, lastWidth) {
            return 0.9 * ((1 + pressure / 255) * (width / 4) - 0.3 * directionToTilt(direction)) + 0.1 * lastWidth;
          },
          getSegmentColour(_speed, _direction, _width, _pressure, _lastWidth) {
            return baseColour;
          },
          getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
            return 1;
          }
        };
      }
      case "shader": {
        return {
          segmentLength: 1e3,
          baseOpacity: 0.1,
          strokeLinecap: "round",
          getSegmentWidth(_speed, _direction, width, _pressure, _lastWidth) {
            return width / 4;
          },
          getSegmentColour(_speed, _direction, _width, _pressure, _lastWidth) {
            return baseColour;
          },
          getSegmentOpacity(_speed, _direction, _width, _pressure, _lastWidth) {
            return 1;
          }
        };
      }
    }
  }

  // src/renderer/layout.ts
  var SCREEN_WIDTH = 1404;
  var SCREEN_HEIGHT = 1872;
  var SCREEN_DPI = 226;
  var SCALE = 72 / SCREEN_DPI;
  function scale(screenUnit) {
    return screenUnit * SCALE;
  }
  function walkItems(items, anchorPositions, defaults) {
    const box = { ...defaults };
    for (const item of items) {
      if (item.type === "stroke") {
        for (const pt of item.points) {
          if (pt.x < box.minX) box.minX = pt.x;
          if (pt.x > box.maxX) box.maxX = pt.x;
          if (pt.y < box.minY) box.minY = pt.y;
          if (pt.y > box.maxY) box.maxY = pt.y;
        }
      } else if (item.type === "group") {
        const ax = item.anchorOriginX ?? 0;
        const ay = anchorPositions.get(item.anchorId ?? "") ?? 0;
        const child = walkItems(item.items, anchorPositions, {
          minX: 0,
          maxX: 0,
          minY: 0,
          maxY: 0
        });
        box.minX = Math.min(box.minX, child.minX + ax);
        box.maxX = Math.max(box.maxX, child.maxX + ax);
        box.minY = Math.min(box.minY, child.minY + ay);
        box.maxY = Math.max(box.maxY, child.maxY + ay);
      }
    }
    return box;
  }
  function getBoundingBox(items, anchorPositions) {
    return walkItems(items, anchorPositions ?? /* @__PURE__ */ new Map(), {
      minX: -SCREEN_WIDTH / 2,
      maxX: SCREEN_WIDTH / 2,
      minY: 0,
      maxY: SCREEN_HEIGHT
    });
  }
  function getAllItems(doc) {
    const all = [];
    for (const page of doc.pages) {
      for (const layer of page.layers) {
        all.push(...layer.items);
      }
    }
    return all;
  }

  // src/renderer/svg.ts
  function uint8ArrayToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa === "function") {
      return btoa(binary);
    }
    return Buffer.from(bytes).toString("base64");
  }
  var _bundledFont;
  function getBundledFont() {
    if (_bundledFont !== void 0) return _bundledFont;
    const req = typeof __require === "function" ? __require : null;
    if (!req || typeof __dirname !== "string") {
      _bundledFont = null;
      return null;
    }
    try {
      const { readFileSync } = req("fs");
      const { resolve } = req("path");
      const fontPath = resolve(__dirname, "..", "fonts", "NotoSans-Regular.ttf");
      _bundledFont = new Uint8Array(readFileSync(fontPath));
      return _bundledFont;
    } catch (err) {
      const code = err?.code;
      if (code !== "ENOENT" && code !== "MODULE_NOT_FOUND") {
        throw err;
      }
      _bundledFont = null;
      return null;
    }
  }
  var LINE_HEIGHTS2 = {
    plain: 70,
    heading: 150,
    bold: 70,
    bullet: 35,
    bullet2: 35,
    checkbox: 35,
    "checkbox-checked": 35,
    numbered: 35
  };
  var TEXT_TOP_Y_OFFSET = -88;
  var XML_ILLEGAL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
  function escapeXmlContent(text) {
    return text.replace(XML_ILLEGAL_CHARS, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeXmlAttr(text) {
    return text.replace(XML_ILLEGAL_CHARS, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function renderStroke(stroke) {
    if (stroke.points.length === 0) return "";
    const pen = createPen(stroke.pen, stroke.colour, stroke.thicknessScale);
    const parts = [];
    let lastX = -1;
    let lastY = -1;
    let lastSegmentWidth = 0;
    let segmentWidth = 0;
    let currentPoints = "";
    for (let i = 0; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      const xPos = point.x;
      const yPos = point.y;
      if (i % pen.segmentLength === 0) {
        if (lastX !== -1) {
          parts.push(`${currentPoints}"/>`);
        }
        const colour = pen.getSegmentColour(
          point.speed,
          point.direction,
          point.width,
          point.pressure,
          lastSegmentWidth
        );
        segmentWidth = pen.getSegmentWidth(
          point.speed,
          point.direction,
          point.width,
          point.pressure,
          lastSegmentWidth
        );
        let opacity = pen.getSegmentOpacity(
          point.speed,
          point.direction,
          point.width,
          point.pressure,
          lastSegmentWidth
        );
        if (stroke.colour.a !== void 0 && stroke.colour.a < 255) {
          opacity = stroke.colour.a / 255;
        }
        opacity = Math.max(0, Math.min(1, opacity));
        const r = Math.round(colour.r);
        const g = Math.round(colour.g);
        const b = Math.round(colour.b);
        const svgWidth = scale(segmentWidth).toFixed(3);
        const blendMode = stroke.pen === "highlighter" || stroke.pen === "shader" ? "; mix-blend-mode:multiply" : "";
        currentPoints = `<polyline style="fill:none; stroke:rgb(${r},${g},${b}); stroke-width:${svgWidth}; opacity:${opacity}${blendMode}" stroke-linecap="${pen.strokeLinecap}" points="`;
        if (lastX !== -1) {
          currentPoints += `${scale(lastX).toFixed(3)},${scale(lastY).toFixed(3)} `;
        }
      }
      lastX = xPos;
      lastY = yPos;
      lastSegmentWidth = segmentWidth;
      currentPoints += `${scale(xPos).toFixed(3)},${scale(yPos).toFixed(3)} `;
    }
    if (stroke.points.length > 0) {
      parts.push(`${currentPoints}"/>`);
    }
    return parts.join("\n");
  }
  var STYLE_PREFIXES = {
    bullet: "\u2022 ",
    bullet2: "\u2022 ",
    checkbox: "\u2610 ",
    "checkbox-checked": "\u2611 "
  };
  function renderText(text, textYMap, fontFamily) {
    const sansFont = fontFamily ?? "sans-serif";
    const serifFont = fontFamily ? `${fontFamily}, serif` : "serif";
    const lines = [];
    lines.push('<g class="root-text" style="display:inline">');
    let yOffset = TEXT_TOP_Y_OFFSET;
    let numberedCounter = 0;
    for (const para of text.paragraphs) {
      const lineHeight = LINE_HEIGHTS2[para.style] ?? 70;
      yOffset += lineHeight;
      let prefix;
      if (para.style === "numbered") {
        numberedCounter++;
        prefix = `${numberedCounter}. `;
      } else {
        numberedCounter = 0;
        prefix = STYLE_PREFIXES[para.style] ?? "";
      }
      const rawText = para.spans.map((s) => s.text).join("");
      let content = prefix ? escapeXmlContent(prefix) : "";
      const hasFormatting = para.spans.some((s) => s.bold || s.italic || s.strikethrough);
      if (hasFormatting) {
        for (const span of para.spans) {
          const attrs = [];
          if (span.bold) attrs.push('font-weight="bold"');
          if (span.italic) attrs.push('font-style="italic"');
          if (span.strikethrough) attrs.push('text-decoration="line-through"');
          if (attrs.length > 0) {
            content += `<tspan ${attrs.join(" ")}>${escapeXmlContent(span.text)}</tspan>`;
          } else {
            content += escapeXmlContent(span.text);
          }
        }
      } else {
        content += para.spans.map((s) => escapeXmlContent(s.text)).join("");
      }
      const x = scale(text.position.x).toFixed(3);
      const screenY = text.position.y + yOffset;
      const y = scale(screenY).toFixed(3);
      if (textYMap && rawText.length > 0) {
        textYMap.set(rawText, { x: text.position.x, y: screenY });
      }
      if (content) {
        const plainFontSize = 10;
        const headingFontSize = 20;
        const fontSize = para.style === "heading" ? headingFontSize : plainFontSize;
        const fontWeight = para.style === "bold" ? "bold" : "normal";
        const ff = para.style === "heading" ? serifFont : sansFont;
        const textDecor = para.style === "checkbox-checked" ? ' text-decoration="line-through"' : "";
        lines.push(
          `  <text x="${x}" y="${y}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="${ff}"${textDecor}>${content}</text>`
        );
      }
    }
    lines.push("</g>");
    return lines.join("\n");
  }
  function renderHighlight(highlight, textYMap) {
    if (highlight.rectangles.length === 0) return "";
    if (highlight.text.length === 0) return "";
    const parts = [];
    const r = Math.round(highlight.colour.r);
    const g = Math.round(highlight.colour.g);
    const b = Math.round(highlight.colour.b);
    const seen = /* @__PURE__ */ new Set();
    const matchedParas = [];
    const pushUnique = (pos) => {
      const key = `${pos.x}:${pos.y}`;
      if (seen.has(key)) return;
      seen.add(key);
      matchedParas.push(pos);
    };
    for (const [paraText, pos] of textYMap) {
      if (highlight.text.includes(paraText) || paraText.includes(highlight.text)) {
        pushUnique(pos);
      }
    }
    if (matchedParas.length === 0) {
      const words = highlight.text.split(/\s+/).filter((w) => w.length > 2);
      if (words.length > 0) {
        for (const [paraText, pos] of textYMap) {
          if (words.some((word) => paraText.includes(word))) {
            pushUnique(pos);
          }
        }
      }
    }
    const rect = highlight.rectangles[0];
    for (const matched of matchedParas) {
      const rectX = matched.x;
      const rectY = matched.y - 35;
      const rectH = 45;
      const x = scale(rectX).toFixed(3);
      const y = scale(rectY).toFixed(3);
      const w = scale(rect.width).toFixed(3);
      const h = scale(rectH).toFixed(3);
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgb(${r},${g},${b})" style="mix-blend-mode:multiply"/>`
      );
    }
    return parts.join("\n");
  }
  function renderGroup(group, anchorPositions, textYMap, fontFamily) {
    let anchorX = 0;
    let anchorY = 0;
    if (group.anchorId !== void 0) {
      anchorX = group.anchorOriginX ?? 0;
      const yPos = anchorPositions.get(group.anchorId);
      if (yPos !== void 0) {
        anchorY = yPos;
      }
    }
    const sortedItems = [...group.items].sort((a, b) => itemDepth(a) - itemDepth(b));
    const inner = sortedItems.map((item) => renderItem(item, anchorPositions, textYMap, fontFamily)).filter((s) => s.length > 0).join("\n");
    return `<g transform="translate(${scale(anchorX).toFixed(3)}, ${scale(anchorY).toFixed(3)})">
${inner}
</g>`;
  }
  function itemDepth(item) {
    if (item.type === "highlight") return 0;
    if (item.type === "stroke" && (item.pen === "highlighter" || item.pen === "shader")) return 0;
    return 1;
  }
  function renderItem(item, anchorPositions, textYMap, fontFamily) {
    switch (item.type) {
      case "stroke":
        return renderStroke(item);
      case "text":
        return renderText(item, void 0, fontFamily);
      case "highlight":
        return renderHighlight(item, textYMap);
      case "group":
        return renderGroup(item, anchorPositions, textYMap, fontFamily);
      default:
        return "";
    }
  }
  function renderDocumentToSvg(doc, options) {
    const allItems = getAllItems(doc);
    const anchorPositions = doc.pages.length > 0 ? doc.pages[0]._anchorPositions ?? /* @__PURE__ */ new Map() : /* @__PURE__ */ new Map();
    const bbox = getBoundingBox(allItems, anchorPositions);
    for (const page of doc.pages) {
      if (page.rootText) {
        const t = page.rootText;
        let yOffset = TEXT_TOP_Y_OFFSET;
        for (const para of t.paragraphs) {
          yOffset += LINE_HEIGHTS2[para.style] ?? 70;
        }
        const textBottom = t.position.y + yOffset + 50;
        if (textBottom > bbox.maxY) bbox.maxY = textBottom;
      }
    }
    const viewMinX = scale(bbox.minX).toFixed(3);
    const viewMinY = scale(bbox.minY).toFixed(3);
    const viewWidth = scale(bbox.maxX - bbox.minX + 1).toFixed(3);
    const viewHeight = scale(bbox.maxY - bbox.minY + 1).toFixed(3);
    let fontFamily;
    let fontFaceCss = "";
    if (options?.embedFont || options?.fontData) {
      const fontBytes = options.fontData ?? getBundledFont();
      if (fontBytes) {
        const b64 = uint8ArrayToBase64(fontBytes);
        fontFamily = "reMarkable";
        fontFaceCss = `<defs><style>@font-face { font-family: "reMarkable"; src: url("data:font/truetype;base64,${b64}") format("truetype"); }</style></defs>`;
      }
    }
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewMinX} ${viewMinY} ${viewWidth} ${viewHeight}" overflow="visible">`
    );
    if (fontFaceCss) {
      lines.push(fontFaceCss);
    }
    for (const page of doc.pages) {
      const anchorPositions2 = page._anchorPositions ?? /* @__PURE__ */ new Map();
      const textYMap = /* @__PURE__ */ new Map();
      let textSvg = "";
      if (page.rootText) {
        textSvg = renderText(page.rootText, textYMap, fontFamily);
      }
      for (const layer of page.layers) {
        if (!layer.visible) continue;
        const layerId = escapeXmlAttr(layer.id);
        lines.push(`<g id="${layerId}">`);
        const sortedLayerItems = [...layer.items].sort((a, b) => itemDepth(a) - itemDepth(b));
        for (const item of sortedLayerItems) {
          const rendered = renderItem(item, anchorPositions2, textYMap, fontFamily);
          if (rendered.length > 0) {
            lines.push(rendered);
          }
        }
        lines.push("</g>");
      }
      if (textSvg) {
        lines.push(textSvg);
      }
    }
    lines.push("</svg>");
    return lines.join("\n");
  }

  // src/browser.ts
  function parse(data) {
    const version = detectVersion(data);
    if (version === 5) return parseV5(data);
    return parseV6(data);
  }
  function renderToSvg(input, options) {
    const doc = input instanceof Uint8Array ? parse(input) : input;
    return renderDocumentToSvg(doc, options);
  }
  return __toCommonJS(browser_exports);
})();
//# sourceMappingURL=index.global.js.map