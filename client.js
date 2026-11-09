/**
 * caopazi-marks — client half.
 *
 * Marks a passage of the conversation (text selection) or a whole message, then
 * jumps back to it later. All state is local to this browser profile.
 *
 * Anchors are the Chat view's own DOM contract:
 *   - every rendered conversation row carries `data-chat-flow-key` / `data-chat-turn`;
 *   - `turnOutline` names each turn's `turn/start` seq, which is the load-through
 *     target that pages an unloaded turn back into the window;
 *   - `binding.session.loadThrough(seq)` / `loadOlder()` page history.
 *
 * No host half, route, or session projection is added.
 */
window.__ModuleLoader__.load({
	id: "caopazi-marks",
	factory: (require) => {
		const React = require("react");
		const ReactDOM = require("react-dom");
		const h = React.createElement;
		const { useState, useEffect, useRef } = React;

		const STORAGE_KEY = "dshm.bookmarks.v1";
		const MAX_BOOKMARKS = 500;
		const ICON_PATH =
			"M6.2 3.4h11.6a1.4 1.4 0 0 1 1.4 1.4v15.6l-7.2-4.2-7.2 4.2V4.8a1.4 1.4 0 0 1 1.4-1.4Z";

		/** Client root context, captured by apply(); DOM helpers run outside React. */
		let ctxRef = null;
		/** Session whose composer currently owns the toolbar button. */
		let liveSessionId = null;
		/** Monotonic jump identity: a newer jump cancels every older scroll/paint callback. */
		let jumpToken = 0;

		/* ────────────────────────────── styles ────────────────────────────── */

		const CSS = [
			".dshbm-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer;flex:none;transition:background-color .12s ease,color .12s ease}",
			".dshbm-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,#5b6068)}",
			'.dshbm-btn[data-active="true"]{color:var(--dsw-alias-state-business-primary,#4d6bfe);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
			".dshbm-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:1px}",
			".dshbm-dot{position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4d6bfe);box-shadow:0 0 0 2px var(--dsw-alias-bg-base,#fff);pointer-events:none}",
			".dshbm-panel{position:fixed;z-index:2147483002;display:flex;flex-direction:column;max-height:min(62vh,520px);box-sizing:border-box;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base,#fff));border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:14px;box-shadow:0 14px 44px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);overflow:hidden;color:var(--dsw-alias-label-primary,#1b1e23);font-size:13px;line-height:1.5;animation:dshbm-pop .14s ease-out}",
			"@keyframes dshbm-pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
			".dshbm-head{display:flex;align-items:center;gap:8px;padding:11px 12px 8px}",
			".dshbm-title{font-size:13px;font-weight:600;letter-spacing:.01em}",
			".dshbm-count{min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:11px;line-height:18px;text-align:center}",
			".dshbm-x{margin-left:auto;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:16px;line-height:1;cursor:pointer;padding:0}",
			".dshbm-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1b1e23)}",
			".dshbm-tabs{display:flex;gap:4px;padding:0 10px 8px}",
			".dshbm-tab{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f98);font:inherit;font-size:12px;padding:4px 9px;border-radius:999px;cursor:pointer}",
			'.dshbm-tab[data-on="true"]{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1b1e23);font-weight:600}',
			".dshbm-list{flex:1;min-height:48px;overflow-y:auto;overscroll-behavior:contain;padding:2px 6px 6px}",
			".dshbm-row{position:relative;display:flex;flex-direction:column;gap:3px;padding:8px 30px 9px 10px;border-radius:9px;cursor:pointer}",
			".dshbm-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
			".dshbm-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:-2px}",
			".dshbm-rowhead{display:flex;align-items:center;gap:6px;min-width:0}",
			".dshbm-role{flex:none;font-size:10px;line-height:16px;height:16px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,#5b6068)}",
			'.dshbm-role[data-role="user"]{background:rgba(77,107,254,.12);color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
			".dshbm-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".dshbm-sess{min-width:0;margin-left:auto}",
			".dshbm-text{font-size:12.5px;color:var(--dsw-alias-label-primary,#1b1e23);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}",
			".dshbm-del{position:absolute;top:6px;right:4px;width:22px;height:22px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:14px;line-height:1;cursor:pointer;opacity:.55;padding:0}",
			".dshbm-del:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1b1e23)}",
			".dshbm-empty{padding:22px 14px;text-align:center;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px;line-height:1.7}",
			".dshbm-foot{border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));padding:7px 8px;display:flex}",
			".dshbm-mark{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#5b6068);font:inherit;font-size:12px;padding:6px 8px;border-radius:7px;cursor:pointer}",
			".dshbm-mark:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1b1e23)}",
			".dshbm-pill{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483002;display:flex;align-items:center;gap:10px;padding:7px 8px 7px 14px;border-radius:999px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base,#fff));border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));box-shadow:0 10px 30px rgba(0,0,0,.16);font-size:12.5px;color:var(--dsw-alias-label-primary,#1b1e23)}",
			".dshbm-pillbtn{border:0;border-radius:999px;padding:4px 10px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,#5b6068);font:inherit;font-size:12px;cursor:pointer}",
			".dshbm-pick{position:fixed;left:50%;transform:translateX(-50%);z-index:2147483001;display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 15px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:999px;background:var(--dsw-alias-button-floating-fill,var(--dsw-alias-bg-overlay,#fff));color:var(--dsw-alias-label-primary,#1b1e23);box-shadow:0 8px 24px rgba(0,0,0,.18);font:inherit;font-size:13px;line-height:1;white-space:nowrap;cursor:pointer;animation:dshbm-in .14s ease-out}",
			".dshbm-pick:hover{background:var(--dsw-alias-button-floating-hover,var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06)))}",
			".dshbm-pick:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:2px}",
			"@keyframes dshbm-in{from{opacity:0;transform:translateX(-50%) translateY(6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}",
			".dshbm-marks{position:fixed;inset:0;pointer-events:none;z-index:2147482998}",
			".dshbm-mark-line{position:fixed;background:rgba(64,120,255,.3);border-radius:3px;box-shadow:0 0 0 1px rgba(64,120,255,.32);opacity:1;transition:opacity .28s ease;animation:dshbm-mark-in .24s ease-out}",
			"@keyframes dshbm-mark-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}",
			".dshbm-spark{position:fixed;z-index:2147482999;pointer-events:none;border-radius:12px;border:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);box-shadow:0 0 0 5px rgba(77,107,254,.14);box-sizing:border-box;opacity:0;animation:dshbm-spark 1.7s ease-out forwards}",
			"@keyframes dshbm-spark{0%{opacity:0}12%{opacity:1}70%{opacity:1}100%{opacity:0}}",
			".dshbm-toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);transform:translate(-50%,6px);z-index:2147483003;padding:7px 13px;border-radius:999px;background:rgba(20,22,26,.92);color:#fff;font-size:12.5px;line-height:1.4;opacity:0;transition:opacity .18s ease,transform .18s ease;pointer-events:none;max-width:80vw}",
			"body.dshbm-arming [data-chat-flow-key]{cursor:crosshair}",
			"body.dshbm-arming [data-chat-flow-key]:hover{box-shadow:inset 0 0 0 1px var(--dsw-alias-state-business-primary,#4d6bfe);border-radius:8px}",
		].join("");

		function ensureStyle() {
			try {
				let tag = document.querySelector("style[data-caopazi-marks]");
				if (tag === null) {
					tag = document.createElement("style");
					tag.setAttribute("data-caopazi-marks", "");
					document.head.appendChild(tag);
				}
				// Keep the sheet in step with this module: a hot reload reuses the tag.
				if (tag.textContent !== CSS) tag.textContent = CSS;
			} catch (error) {
				console.error("caopazi-marks: stylesheet failed", error);
			}
		}

		/* ─────────────────────────────── store ─────────────────────────────── */

		function validBookmark(value) {
			return (
				value !== null &&
				typeof value === "object" &&
				typeof value.id === "string" &&
				value.id !== "" &&
				typeof value.sessionId === "string" &&
				value.sessionId !== "" &&
				typeof value.flowKey === "string" &&
				typeof value.createdAt === "number"
			);
		}

		function readBookmarks() {
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (raw === null) return [];
				const parsed = JSON.parse(raw);
				if (!Array.isArray(parsed)) return [];
				return parsed.filter(validBookmark).slice(0, MAX_BOOKMARKS);
			} catch (error) {
				console.error("caopazi-marks: stored state unreadable", error);
				return [];
			}
		}

		let bookmarks = readBookmarks();
		const listeners = new Set();

		function subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}

		function persist() {
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
			} catch (error) {
				console.error("caopazi-marks: could not persist", error);
			}
		}

		function commit(next) {
			bookmarks = next;
			persist();
			for (const listener of listeners) {
				try {
					listener();
				} catch (error) {
					console.error("caopazi-marks: listener failed", error);
				}
			}
		}

		function uid() {
			try {
				if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
			} catch (_) {
				/* fall through */
			}
			return "bm-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
		}

		function useBookmarks() {
			const [snapshot, setSnapshot] = useState(bookmarks);
			useEffect(() => {
				setSnapshot(bookmarks);
				return subscribe(() => setSnapshot(bookmarks));
			}, []);
			return snapshot;
		}

		/* ─────────────────────────── transient UI ─────────────────────────── */

		let toastEl = null;
		let toastTimer = null;

		function toast(message) {
			try {
				if (toastEl === null) {
					toastEl = document.createElement("div");
					toastEl.className = "dshbm-toast";
				}
				const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
				let bottom = 140;
				try {
					const seat = document.querySelector("[data-composer-seat]");
					if (seat !== null) {
						const rect = seat.getBoundingClientRect();
						if (rect.height > 0 && rect.top > viewportHeight * 0.45)
							bottom = Math.max(24, viewportHeight - rect.top + 14);
					}
				} catch (error) {
					/* keep the default offset */
				}
				toastEl.style.bottom = bottom + "px";
				toastEl.textContent = message;
				if (!toastEl.isConnected) document.body.appendChild(toastEl);
				toastEl.style.opacity = "1";
				toastEl.style.transform = "translate(-50%,0)";
				if (toastTimer !== null) clearTimeout(toastTimer);
				toastTimer = setTimeout(() => {
					if (toastEl !== null) toastEl.style.opacity = "0";
				}, 2100);
			} catch (_) {
				/* a toast must never break the interaction */
			}
		}

		/* ────────────────────────────── anchors ────────────────────────────── */

		function roleOfRow(row) {
			const kind = row.getAttribute("data-chat-flow-kind") || "";
			if (kind === "user") return "user";
			if (kind === "assistant-step") return "assistant";
			return "other";
		}

		function turnOfRow(row) {
			const raw = row.getAttribute("data-chat-turn");
			if (raw === null) return -1;
			const turn = Number(raw);
			return Number.isFinite(turn) ? turn : -1;
		}

		function seqOfTurn(sessionId, turn) {
			if (!Number.isFinite(turn) || turn < 0) return null;
			try {
				const sessions = ctxRef && ctxRef.get("sessions");
				const binding = sessions && sessions.binding(sessionId);
				const session = binding && binding.session;
				const projections = session && session.projections;
				const outline = projections && projections.faceOf("turnOutline").getSnapshot();
				if (!Array.isArray(outline)) return null;
				for (const entry of outline) {
					if (entry && entry.turn === turn && typeof entry.seq === "number") return entry.seq;
				}
			} catch (error) {
				/* projection absent: the jump falls back to loadOlder() */
			}
			return null;
		}

		function findRowByKey(key) {
			if (!key) return null;
			const rows = document.querySelectorAll("[data-chat-flow-key]");
			for (const row of rows) {
				if (row.getAttribute("data-chat-flow-key") === key) return row;
			}
			return null;
		}

		function rowVisible(row) {
			try {
				return row.getClientRects().length > 0;
			} catch (error) {
				return true;
			}
		}

		function visibleTurnRow(turn) {
			if (!Number.isFinite(turn) || turn < 0) return null;
			const rows = document.querySelectorAll('[data-chat-turn="' + turn + '"]');
			for (const row of rows) {
				if (rowVisible(row)) return row;
			}
			return rows.length > 0 ? rows[0] : null;
		}

		function wait(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		}

		/* ─────────────────────── text ranges and flashes ─────────────────────── */

		function textNodesOf(root) {
			const nodes = [];
			let text = "";
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
				acceptNode(node) {
					const parent = node.parentElement;
					if (parent === null) return NodeFilter.FILTER_REJECT;
					if (parent.closest("script,style,button,[data-text-interaction-exclude]") !== null)
						return NodeFilter.FILTER_REJECT;
					return NodeFilter.FILTER_ACCEPT;
				},
			});
			let node = walker.nextNode();
			while (node !== null) {
				nodes.push({ node, start: text.length });
				text += node.nodeValue || "";
				node = walker.nextNode();
			}
			return { nodes, text };
		}

		function squash(value) {
			let out = "";
			const map = [];
			for (let index = 0; index < value.length; index += 1) {
				const char = value.charAt(index);
				if (/\s/.test(char)) {
					if (out.length > 0 && out.charAt(out.length - 1) !== " ") {
						out += " ";
						map.push(index);
					}
					continue;
				}
				out += char;
				map.push(index);
			}
			while (out.length > 0 && out.charAt(out.length - 1) === " ") {
				out = out.slice(0, -1);
				map.pop();
			}
			return { text: out, map };
		}

		function pointAt(nodes, offset) {
			if (nodes.length === 0) return null;
			let low = 0;
			let high = nodes.length - 1;
			while (low < high) {
				const mid = (low + high + 1) >> 1;
				if (nodes[mid].start <= offset) low = mid;
				else high = mid - 1;
			}
			const entry = nodes[low];
			const local = Math.max(0, Math.min(offset - entry.start, (entry.node.nodeValue || "").length));
			return { node: entry.node, offset: local };
		}

		function rangeForText(root, needle) {
			const wanted = String(needle || "").trim();
			if (wanted.length < 2) return null;
			const { nodes, text } = textNodesOf(root);
			if (nodes.length === 0) return null;
			let start = text.indexOf(wanted);
			let end = start + wanted.length;
			if (start < 0) {
				const whole = squash(text);
				const part = squash(wanted).text;
				if (part.length < 2) return null;
				const at = whole.text.indexOf(part);
				if (at < 0) return null;
				start = whole.map[at];
				end = whole.map[at + part.length - 1] + 1;
			}
			const from = pointAt(nodes, start);
			const to = pointAt(nodes, end);
			if (from === null || to === null) return null;
			try {
				const range = document.createRange();
				range.setStart(from.node, from.offset);
				range.setEnd(to.node, to.offset);
				return range;
			} catch (error) {
				return null;
			}
		}

		/** First line of a stored excerpt, bounded for a reliable rendered-text match. */
		function matchNeedle(text) {
			const lines = String(text || "")
				.split(/[\n\r]+/)
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
			const base = lines.length > 0 ? lines[0] : String(text || "").replace(/\s+/g, " ").trim();
			return base.slice(0, 90);
		}

		/** Remove any overlay from a previous jump so two highlights never stack. */
		function clearMarks() {
			const layers = document.querySelectorAll(".dshbm-marks");
			for (const layer of layers) layer.remove();
		}

		/** Remove any whole-message ring left by a previous jump. */
		function clearSparks() {
			const boxes = document.querySelectorAll(".dshbm-spark");
			for (const box of boxes) box.remove();
		}

		/**
		 * Paint a matched range with fixed-position rectangles over its client rects.
		 * The CSS Custom Highlight API is not available in every WebView, so this overlay is
		 * the reliable path: it never touches React-owned nodes.
		 */
		function paintRange(range) {
			let rects = [];
			try {
				rects = Array.from(range.getClientRects());
			} catch (error) {
				rects = [];
			}
			const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
			// Never clamp an off-screen line to the top edge: drop it instead.
			rects = rects.filter(
				(rect) => rect.width > 1 && rect.height > 1 && rect.bottom > -8 && rect.top < viewportHeight + 8,
			);
			if (rects.length === 0) return false;
			clearMarks();
			const layer = document.createElement("div");
			layer.className = "dshbm-marks";
			for (const rect of rects) {
				const line = document.createElement("div");
				line.className = "dshbm-mark-line";
				line.style.left = rect.left - 2 + "px";
				line.style.top = rect.top - 1 + "px";
				line.style.width = Math.max(2, rect.width + 4) + "px";
				line.style.height = Math.max(2, rect.height + 2) + "px";
				layer.appendChild(line);
			}
			document.body.appendChild(layer);
			// Only user gestures dismiss the marks; a programmatic scroll event must not.
			let dropped = false;
			const drop = () => {
				if (dropped) return;
				dropped = true;
				window.removeEventListener("touchmove", drop, true);
				window.removeEventListener("wheel", drop, true);
				layer.remove();
			};
			window.addEventListener("touchmove", drop, true);
			window.addEventListener("wheel", drop, true);
			setTimeout(() => {
				for (const line of layer.children) line.style.opacity = "0";
			}, 3600);
			setTimeout(drop, 4000);
			return true;
		}

		/** Nearest scrollable ancestor of a text node, so the exact line can be centered. */
		function scrollableAncestor(node) {
			let element = node && node.nodeType === 3 ? node.parentElement : node;
			while (element !== null && element !== document.body && element !== document.documentElement) {
				let style = null;
				try {
					style = window.getComputedStyle(element);
				} catch (error) {
					style = null;
				}
				if (
					style !== null &&
					/(auto|scroll)/.test(style.overflowY) &&
					element.scrollHeight > element.clientHeight + 4
				)
					return element;
				element = element.parentElement;
			}
			return null;
		}

		function safeRangeRect(range) {
			try {
				return range.getBoundingClientRect();
			} catch (error) {
				return null;
			}
		}

		/**
		 * Center the matched line with instant scrollTop math. Instant (not smooth) so the
		 * highlight is painted against final layout and no animation can race it.
		 */
		function scrollRangeIntoCenter(range) {
			const node = range.startContainer;
			const element = node && node.nodeType === 3 ? node.parentElement : node;
			if (!element) return false;
			const scroller = scrollableAncestor(element);
			if (scroller !== null) {
				for (let pass = 0; pass < 3; pass += 1) {
					const rect = safeRangeRect(range);
					if (rect === null || (rect.width === 0 && rect.height === 0)) break;
					const box = scroller.getBoundingClientRect();
					const delta = rect.top + rect.height / 2 - (box.top + box.height / 2);
					if (Math.abs(delta) < 6) break;
					const before = scroller.scrollTop;
					scroller.scrollTop = before + delta;
					if (Math.abs(scroller.scrollTop - before) < 1) break;
				}
			}
			// Verify the landing; otherwise let the browser scroll every ancestor.
			const rect = safeRangeRect(range);
			const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
			if (rect !== null && rect.height > 0 && rect.top >= -4 && rect.bottom <= viewportHeight + 4) return true;
			try {
				element.scrollIntoView({ block: "center" });
			} catch (error) {
				return false;
			}
			return true;
		}

		/** Where the matched line should sit: the scroller plus the scrollTop that centers it. */
		function scrollTargetFor(range) {
			const node = range.startContainer;
			const element = node && node.nodeType === 3 ? node.parentElement : node;
			if (!element) return null;
			const rect = safeRangeRect(range);
			if (rect === null) return null;
			const scroller = scrollableAncestor(element);
			if (scroller === null) return { element };
			const box = scroller.getBoundingClientRect();
			const delta = rect.top + rect.height / 2 - (box.top + box.height / 2);
			return { scroller, target: scroller.scrollTop + delta };
		}

		/**
		 * Ease-out scroll driven by setTimeout. The first instant pixel step happens before any
		 * scroll event is delivered, which makes the movement reader-attributed — otherwise a
		 * conversation pinned to the tail snaps back to the bottom on that first event and the
		 * whole glide is lost.
		 */
		function animateScrollTo(scroller, target, token, done) {
			const startTop = scroller.scrollTop;
			const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
			const goal = Math.max(0, Math.min(target, maxTop));
			const distance = goal - startTop;
			if (Math.abs(distance) < 1) {
				done();
				return;
			}
			const nudge = Math.sign(distance) * Math.min(4, Math.abs(distance));
			scroller.scrollTop = startTop + nudge;
			const duration = Math.max(260, Math.min(520, 260 + Math.abs(distance) / 12));
			const started = Date.now();
			const step = () => {
				if (token !== jumpToken) return;
				const t = Math.min(1, (Date.now() - started) / duration);
				const eased = 1 - Math.pow(1 - t, 3);
				if (t < 1) {
					scroller.scrollTop = startTop + nudge + (distance - nudge) * eased;
					setTimeout(step, 16);
					return;
				}
				scroller.scrollTop = goal;
				done();
			};
			setTimeout(step, 16);
		}

		/** The safety net: if the target is not fully visible after the animation, snap it into view. */
		function ensureRangeVisible(range) {
			const rect = safeRangeRect(range);
			const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
			if (rect !== null && rect.height > 0 && rect.top >= -4 && rect.bottom <= viewportHeight + 4) return true;
			return scrollRangeIntoCenter(range);
		}

		function spark(row) {
			try {
				const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
				const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 800;
				const rect = row.getBoundingClientRect();
				if (rect.height === 0 || rect.bottom < 0 || rect.top > viewportHeight) return;
				const box = document.createElement("div");
				box.className = "dshbm-spark";
				box.style.left = Math.max(4, rect.left - 6) + "px";
				box.style.top = Math.max(4, rect.top - 6) + "px";
				box.style.width = Math.min(viewportWidth - 8, rect.width + 12) + "px";
				box.style.height = Math.max(28, rect.height + 12) + "px";
				document.body.appendChild(box);
				setTimeout(() => {
					box.remove();
				}, 1800);
			} catch (error) {
				/* decorative */
			}
		}

		function land(bookmark, row, token) {
			if (token !== jumpToken) return;
			try {
				// Clear the previous jump's overlay the instant this one starts, so a stale
				// fixed highlight can never hang over the conversation while we glide.
				clearMarks();
				clearSparks();
				const wantsText = bookmark.scope !== "message" && !!bookmark.text;
				let range = null;
				if (wantsText) {
					const needle = matchNeedle(bookmark.text);
					if (needle.length >= 2) range = rangeForText(row, needle);
				}

				const finish = () => {
					if (token !== jumpToken) return;
					try {
						if (range !== null) {
							// The glide may have been clamped or interrupted: correct instantly.
							ensureRangeVisible(range);
							if (paintRange(range)) {
								setTimeout(() => {
									if (token === jumpToken) paintRange(range);
								}, 260);
								return;
							}
						}
						spark(row);
						if (wantsText && range === null) toast("没匹配到原文，先定位到整条消息");
					} catch (error) {
						console.error("caopazi-marks: finish failed", error);
						spark(row);
					}
				};

				const motion = range !== null ? scrollTargetFor(range) : null;
				if (motion !== null && motion.element) {
					try {
						motion.element.scrollIntoView({ block: "center", behavior: "smooth" });
					} catch (error) {
						motion.element.scrollIntoView({ block: "center" });
					}
					setTimeout(finish, 420);
					return;
				}
				if (motion !== null && motion.scroller) {
					animateScrollTo(motion.scroller, motion.target, token, finish);
					return;
				}

				// Whole-message target: glide to the row with the same animation.
				const scroller = scrollableAncestor(row);
				if (scroller !== null) {
					const box = scroller.getBoundingClientRect();
					const rect = row.getBoundingClientRect();
					const delta = rect.top + rect.height / 2 - (box.top + box.height / 2);
					animateScrollTo(scroller, scroller.scrollTop + delta, token, finish);
					return;
				}
				try {
					row.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
				} catch (error) {
					try {
						row.scrollIntoView({ block: "center" });
					} catch (_) {
						/* ignore */
					}
				}
				setTimeout(finish, 420);
			} catch (error) {
				console.error("caopazi-marks: land failed", error);
				try {
					row.scrollIntoView({ block: "center" });
				} catch (_) {
					/* ignore */
				}
				spark(row);
			}
		}

		/* ─────────────────────────────── jumping ─────────────────────────────── */

		async function pageIn(bookmark) {
			try {
				const sessions = ctxRef && ctxRef.get("sessions");
				const binding = sessions && sessions.binding(bookmark.sessionId);
				const session = binding && binding.session;
				if (!session) return;
				const seq =
					typeof bookmark.seq === "number" ? bookmark.seq : seqOfTurn(bookmark.sessionId, bookmark.turn);
				// A targeted load is retried as-is: loadThrough returns early while another page
				// is in flight, and the next attempt must retarget the same seq (never walk away).
				if (typeof seq === "number" && typeof session.loadThrough === "function") {
					await session.loadThrough(seq);
					return;
				}
				if (typeof session.loadOlder === "function") await session.loadOlder();
			} catch (error) {
				/* best effort: the locate loop decides whether it worked */
			}
		}

		async function locate(bookmark, token) {
			const deadline = Date.now() + 20000;
			let loads = 0;
			while (Date.now() < deadline) {
				if (token !== jumpToken) return false;
				const exact = findRowByKey(bookmark.flowKey);
				if (exact !== null) {
					if (rowVisible(exact)) {
						land(bookmark, exact, token);
						return true;
					}
					// The target row is mounted but folded away: land on the visible row of its turn.
					const foldedTurn = visibleTurnRow(bookmark.turn);
					if (foldedTurn !== null && rowVisible(foldedTurn)) {
						land(bookmark, foldedTurn, token);
						return true;
					}
				}
				// Give history one real page-in before settling for the turn; then keep trying.
				const byTurn = visibleTurnRow(bookmark.turn);
				if (byTurn !== null && loads >= 2) {
					land(bookmark, byTurn, token);
					return true;
				}
				if (loads < 6) {
					loads += 1;
					if (loads === 1) toast("正在加载那段历史…");
					await pageIn(bookmark);
					await wait(220);
					continue;
				}
				if (byTurn !== null && rowVisible(byTurn)) {
					land(bookmark, byTurn, token);
					return true;
				}
				await wait(200);
			}
			return false;
		}

		async function jumpTo(bookmark) {
			const token = ++jumpToken;
			// The click itself retires the previous highlight, even if paging takes a while.
			clearMarks();
			clearSparks();
			try {
				if (!bookmark || !bookmark.sessionId) return false;
				const workspace = ctxRef && ctxRef.get("uiWorkspace");
				if (bookmark.sessionId !== liveSessionId) {
					if (!workspace || typeof workspace.openSession !== "function") {
						toast("打不开对应会话");
						return false;
					}
					workspace.openSession(bookmark.sessionId);
					await wait(400);
				}
				if (token !== jumpToken) return false;
				const slow = setTimeout(() => {
					if (token === jumpToken) toast("正在定位…");
				}, 400);
				const ok = await locate(bookmark, token);
				clearTimeout(slow);
				if (token !== jumpToken) return false;
				if (!ok) toast("没找到这条书签，可能已不在当前加载的历史里");
				return ok;
			} catch (error) {
				console.error("caopazi-marks: jump failed", error);
				if (token === jumpToken) toast("定位失败，请再试一次");
				return false;
			}
		}

		/* ─────────────────────────────── writing ─────────────────────────────── */

		function titleOf(sessionId) {
			try {
				const sessions = ctxRef && ctxRef.get("sessions");
				const list = sessions && sessions.list && sessions.list.getSnapshot();
				const row = list && list.byId ? list.byId[sessionId] : null;
				if (row && typeof row.title === "string" && row.title.trim() !== "") return row.title;
			} catch (error) {
				/* title is only a convenience */
			}
			const known = bookmarks.find((entry) => entry.sessionId === sessionId && entry.sessionTitle);
			return known ? known.sessionTitle : "";
		}

		function addBookmark(input) {
			try {
				if (!input || !input.sessionId) return;
				const flowKey = typeof input.flowKey === "string" ? input.flowKey : "";
				if (flowKey === "" && !(typeof input.turn === "number" && input.turn >= 0)) {
					toast("没有定位到这条消息");
					return;
				}
				const text = String(input.text || "").slice(0, 400);
				const duplicate = bookmarks.some(
					(entry) =>
						entry.sessionId === input.sessionId && entry.flowKey === flowKey && (entry.text || "") === text,
				);
				if (duplicate) {
					toast("这条已经在书签里了");
					return;
				}
				const bookmark = {
					id: uid(),
					sessionId: input.sessionId,
					sessionTitle: titleOf(input.sessionId),
					role: input.role || "other",
					scope: input.scope === "message" ? "message" : "text",
					turn: typeof input.turn === "number" ? input.turn : -1,
					flowKey,
					nodeKey: input.nodeKey || "",
					text,
					seq: typeof input.seq === "number" ? input.seq : null,
					createdAt: Date.now(),
				};
				commit([bookmark].concat(bookmarks).slice(0, MAX_BOOKMARKS));
				toast("已加入书签");
			} catch (error) {
				console.error("caopazi-marks: add failed", error);
			}
		}

		function addFromRow(row, sessionId) {
			if (!row || !sessionId) return;
			const turn = turnOfRow(row);
			const source = row.querySelector("[data-text-interaction-source]");
			const raw = (source || row).innerText || "";
			addBookmark({
				sessionId,
				role: roleOfRow(row),
				scope: "message",
				turn,
				flowKey: row.getAttribute("data-chat-flow-key") || "",
				nodeKey: row.getAttribute("data-chat-node-key") || "",
				text: raw.replace(/\s+/g, " ").trim().slice(0, 400),
				seq: seqOfTurn(sessionId, turn),
			});
		}

		function removeBookmark(id) {
			commit(bookmarks.filter((entry) => entry.id !== id));
		}

		/* ─────────────────────────── selection affordance ─────────────────────────── */

		function installSelectionChip() {
			let pill = null;
			let pending = null;
			let timer = null;

			const hide = () => {
				if (timer !== null) {
					clearTimeout(timer);
					timer = null;
				}
				if (pill !== null) {
					pill.remove();
					pill = null;
				}
				pending = null;
			};

			/** Dock just above the composer, out of reach of the native selection menu. */
			const seatBottom = () => {
				try {
					const seat = document.querySelector("[data-composer-seat]");
					if (seat !== null) {
						const rect = seat.getBoundingClientRect();
						if (rect.height > 0 && rect.top > window.innerHeight * 0.45)
							return Math.max(12, window.innerHeight - rect.top + 10);
					}
				} catch (error) {
					/* fall back to a stable offset */
				}
				return 120;
			};

			const show = () => {
				const button = document.createElement("button");
				button.type = "button";
				button.className = "dshbm-pick";
				button.title = "标记选中的文字";
				button.setAttribute("aria-label", "把选中的文字标记为书签");
				button.style.bottom = seatBottom() + "px";
				button.innerHTML =
					'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
					ICON_PATH +
					'"/></svg><span>标记选中的文字</span>';
				button.addEventListener("pointerdown", (event) => {
					event.preventDefault();
					event.stopPropagation();
				});
				button.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					const data = pending;
					hide();
					if (data !== null) {
						addBookmark(data);
						try {
							const selection = window.getSelection();
							if (selection !== null) selection.removeAllRanges();
						} catch (error) {
							/* selection cleanup is cosmetic */
						}
					}
				});
				document.body.appendChild(button);
				pill = button;
				return true;
			};

			const consider = () => {
				if (pill !== null) return;
				if (document.body.classList.contains("dshbm-arming")) return;
				const selection = window.getSelection();
				if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
				const text = String(selection.toString()).replace(/\s+/g, " ").trim();
				if (text.length < 2) return;
				const range = selection.getRangeAt(0);
				const startEl =
					range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
				if (!startEl || typeof startEl.closest !== "function") return;
				if (startEl.closest(".dshbm-panel,.dshbm-pick,.dshbm-pill") !== null) return;
				const source = startEl.closest("[data-text-interaction-source]");
				if (source === null) return;
				const row = source.closest("[data-chat-flow-key]");
				if (row === null) return;
				const sessionId = liveSessionId;
				if (!sessionId) return;
				const turn = turnOfRow(row);
				pending = {
					sessionId,
					role: roleOfRow(row),
					scope: "text",
					turn,
					flowKey: row.getAttribute("data-chat-flow-key") || "",
					nodeKey: row.getAttribute("data-chat-node-key") || "",
					text: text.slice(0, 400),
					seq: seqOfTurn(sessionId, turn),
				};
				show();
			};

			const schedule = () => {
				if (pill !== null) return;
				if (timer !== null) clearTimeout(timer);
				timer = setTimeout(() => {
					timer = null;
					consider();
				}, 90);
			};

			const onSelectionChange = () => schedule();
			const onPointerDown = (event) => {
				if (pill !== null && !pill.contains(event.target)) hide();
			};
			const onKey = (event) => {
				if (event.key === "Escape") hide();
			};
			const onScroll = () => {
				if (pill !== null) hide();
			};
			const onResize = () => {
				if (pill !== null) pill.style.bottom = seatBottom() + "px";
			};

			document.addEventListener("selectionchange", onSelectionChange);
			document.addEventListener("pointerdown", onPointerDown, true);
			document.addEventListener("keydown", onKey, true);
			window.addEventListener("scroll", onScroll, true);
			window.addEventListener("resize", onResize);

			return () => {
				if (timer !== null) clearTimeout(timer);
				document.removeEventListener("selectionchange", onSelectionChange);
				document.removeEventListener("pointerdown", onPointerDown, true);
				document.removeEventListener("keydown", onKey, true);
				window.removeEventListener("scroll", onScroll, true);
				window.removeEventListener("resize", onResize);
				if (pill !== null) pill.remove();
				pill = null;
				pending = null;
			};
		}

		/* ──────────────────────────────── views ──────────────────────────────── */

		function Icon(props) {
			const size = props && props.size ? props.size : 17;
			return h(
				"svg",
				{
					viewBox: "0 0 24 24",
					width: size,
					height: size,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.7,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": true,
				},
				h("path", { d: ICON_PATH }),
			);
		}

		function relTime(timestamp) {
			const delta = Date.now() - timestamp;
			if (delta < 60 * 1000) return "刚刚";
			if (delta < 60 * 60 * 1000) return Math.floor(delta / 60000) + " 分钟前";
			if (delta < 24 * 60 * 60 * 1000) return Math.floor(delta / 3600000) + " 小时前";
			const date = new Date(timestamp);
			const now = new Date();
			const sameYear = date.getFullYear() === now.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			return sameYear ? month + "-" + day : date.getFullYear() + "-" + month + "-" + day;
		}

		function tabButton(key, label, count, tab, setTab) {
			return h(
				"button",
				{
					key,
					type: "button",
					className: "dshbm-tab",
					"data-on": tab === key ? "true" : "false",
					onClick: () => setTab(key),
				},
				count > 0 ? label + " " + count : label,
			);
		}

		function rowFor(bookmark, onJump, onDelete, showSession) {
			const role = bookmark.role === "user" ? "我" : bookmark.role === "assistant" ? "你" : "对话";
			return h(
				"div",
				{
					key: bookmark.id,
					className: "dshbm-row",
					role: "button",
					tabIndex: 0,
					onClick: () => onJump(bookmark),
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onJump(bookmark);
						}
					},
				},
				h("div", { key: "head", className: "dshbm-rowhead" }, [
					h("span", { key: "role", className: "dshbm-role", "data-role": bookmark.role || "other" }, role),
					h("span", { key: "time", className: "dshbm-meta" }, relTime(bookmark.createdAt)),
					showSession
						? h(
								"span",
								{ key: "session", className: "dshbm-meta dshbm-sess" },
								titleOf(bookmark.sessionId) || bookmark.sessionTitle || "其他会话",
							)
						: null,
				]),
				h("div", { key: "text", className: "dshbm-text" }, bookmark.text || "（整条消息）"),
				h(
					"button",
					{
						key: "delete",
						type: "button",
						className: "dshbm-del",
						title: "删除这条书签",
						"aria-label": "删除这条书签",
						onClick: (event) => {
							event.stopPropagation();
							onDelete(bookmark.id);
						},
					},
					"×",
				),
			);
		}

		function Panel(props) {
			const { items, sessionId, anchor, tab, setTab, onClose, onJump, onDelete, onArm } = props;
			const mine = items.filter((entry) => entry.sessionId === sessionId);
			const shown =
				tab === "session"
					? mine
					: items.slice().sort((left, right) => right.createdAt - left.createdAt);
			const width = Math.max(260, Math.min(360, window.innerWidth - 24));
			let left = anchor ? anchor.left + (anchor.right - anchor.left) / 2 - width / 2 : (window.innerWidth - width) / 2;
			left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
			let bottom = anchor ? window.innerHeight - anchor.top + 10 : 96;
			bottom = Math.max(12, Math.min(bottom, window.innerHeight - 180));

			return h(
				"div",
				{
					className: "dshbm-panel",
					"data-dshbm": "panel",
					role: "dialog",
					"aria-label": "会话书签",
					style: { left: left + "px", bottom: bottom + "px", width: width + "px" },
				},
				h("div", { key: "head", className: "dshbm-head" }, [
					h("span", { key: "title", className: "dshbm-title" }, "书签"),
					h("span", { key: "count", className: "dshbm-count" }, String(mine.length)),
					h(
						"button",
						{
							key: "close",
							type: "button",
							className: "dshbm-x",
							title: "关闭",
							"aria-label": "关闭书签面板",
							onClick: onClose,
						},
						"×",
					),
				]),
				h("div", { key: "tabs", className: "dshbm-tabs" }, [
					tabButton("session", "本会话", mine.length, tab, setTab),
					tabButton("all", "全部", items.length, tab, setTab),
				]),
				h(
					"div",
					{ key: "list", className: "dshbm-list" },
					shown.length === 0
						? h(
								"div",
								{ className: "dshbm-empty" },
								tab === "session"
									? "还没有书签。划选一段文字，或点下面的「标记消息」。"
									: "还没有任何书签。",
							)
						: shown.map((entry) => rowFor(entry, onJump, onDelete, tab === "all")),
				),
				h(
					"div",
					{ key: "foot", className: "dshbm-foot" },
					h(
						"button",
						{ type: "button", className: "dshbm-mark", onClick: onArm },
						h(Icon, { key: "icon", size: 15 }),
						h("span", { key: "label" }, "标记消息"),
					),
				),
			);
		}

		function BookmarkButton(props) {
			const sessionId = props.sessionId;
			const items = useBookmarks();
			const [open, setOpen] = useState(false);
			const [tab, setTab] = useState("session");
			const [armed, setArmed] = useState(false);
			const [anchor, setAnchor] = useState(null);
			const buttonRef = useRef(null);

			useEffect(() => {
				if (sessionId) liveSessionId = sessionId;
			}, [sessionId]);

			useEffect(() => {
				if (!open) return undefined;
				const onDown = (event) => {
					const target = event.target;
					if (target instanceof Element && (target.closest(".dshbm-panel") || target.closest(".dshbm-btn"))) return;
					setOpen(false);
				};
				const onKey = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("pointerdown", onDown, true);
				document.addEventListener("keydown", onKey, true);
				return () => {
					document.removeEventListener("pointerdown", onDown, true);
					document.removeEventListener("keydown", onKey, true);
				};
			}, [open]);

			useEffect(() => {
				if (!armed) return undefined;
				document.body.classList.add("dshbm-arming");
				const onClick = (event) => {
					const target = event.target;
					if (!(target instanceof Element)) return;
					if (target.closest(".dshbm-panel,.dshbm-pill,.dshbm-toast,.dshbm-btn") !== null) return;
					const row = target.closest("[data-chat-flow-key]");
					if (row === null) return;
					event.preventDefault();
					event.stopPropagation();
					addFromRow(row, sessionId || liveSessionId);
					setArmed(false);
				};
				const onKey = (event) => {
					if (event.key === "Escape") setArmed(false);
				};
				document.addEventListener("click", onClick, true);
				document.addEventListener("keydown", onKey, true);
				return () => {
					document.removeEventListener("click", onClick, true);
					document.removeEventListener("keydown", onKey, true);
					document.body.classList.remove("dshbm-arming");
				};
			}, [armed, sessionId]);

			const mine = items.filter((entry) => entry.sessionId === sessionId);

			return h(React.Fragment, null, [
				h(
					"button",
					{
						key: "button",
						ref: buttonRef,
						type: "button",
						className: "dshbm-btn",
						"data-dshbm": "button",
						"data-active": open ? "true" : "false",
						title: "会话书签",
						"aria-label": "会话书签",
						onClick: () => {
							if (open) {
								setOpen(false);
								return;
							}
							const rect = buttonRef.current ? buttonRef.current.getBoundingClientRect() : null;
							setAnchor(
								rect === null
									? null
									: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
							);
							setOpen(true);
						},
					},
					[
						h(Icon, { key: "icon", size: 17 }),
						mine.length > 0 ? h("span", { key: "dot", className: "dshbm-dot" }) : null,
					],
				),
				open
					? h(
							React.Fragment,
							{ key: "panel" },
							ReactDOM.createPortal(
								h(Panel, {
									items,
									sessionId,
									anchor,
									tab,
									setTab,
									onClose: () => setOpen(false),
									onJump: (bookmark) => {
										setOpen(false);
										jumpTo(bookmark);
									},
									onDelete: (id) => removeBookmark(id),
									onArm: () => {
										setOpen(false);
										setArmed(true);
									},
								}),
								document.body,
							),
						)
					: null,
				armed
					? h(
							React.Fragment,
							{ key: "pill" },
							ReactDOM.createPortal(
								h("div", { className: "dshbm-pill", "data-dshbm": "pill" }, [
									h("span", { key: "label" }, "点一条消息，把它加入书签"),
									h(
										"button",
										{
											key: "cancel",
											type: "button",
											className: "dshbm-pillbtn",
											onClick: () => setArmed(false),
										},
										"取消",
									),
								]),
								document.body,
							),
						)
					: null,
			]);
		}

		/* ──────────────────────────────── plugin ──────────────────────────────── */

		function apply(ctx) {
			ctxRef = ctx;
			ensureStyle();
			try {
				ctx.effect(() => installSelectionChip(), "caopazi-marks: selection chip");
			} catch (error) {
				console.error("caopazi-marks: selection chip failed", error);
			}
			try {
				ctx.slots.inject("conversation.input.left", () =>
					ctx.slots.register(
						{
							name: "conversation.input.left",
							id: "caopazi-marks",
							order: 40,
							inject: (sessionId) => ({ sessionId }),
						},
						BookmarkButton,
					),
				);
			} catch (error) {
				console.error("caopazi-marks: toolbar registration failed", error);
			}
		}

		return {
			name: "caopazi-marks",
			inject: ["slots", "sessions"],
			apply,
		};
	},
});
