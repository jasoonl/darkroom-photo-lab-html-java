/* Darkroom UI runtime
 * A small dependency-free template renderer for index.html. It reads the markup inside
 * <template id="dc-template"> ({{path}} holes, <sc-for list as>, <sc-if value>, onClick="{{fn}}",
 * ref="{{fn}}"), calls the component's renderVals() and patches the real DOM in place.
 * Written for this project; the app itself (app.js) is a class extending DCLogic.
 */
(function () {
  'use strict';

  class DCLogic {
    constructor(props) { this.props = props || {}; this.__flush = null; }
    forceUpdate() { if (this.__flush) this.__flush(); }
  }
  window.DCLogic = DCLogic;

  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  const ANY = /\{\{\s*([^}]+?)\s*\}\}/g;
  const BOOL_ATTRS = { disabled: 1, checked: 1, multiple: 1, selected: 1, hidden: 1, readonly: 1, required: 1 };
  const EVENT_NAMES = { doubleclick: 'dblclick' };

  function lookup(scope, path) {
    let o = scope;
    const parts = path.split('.');
    for (let i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  const textOf = (v) => (v == null || v === false || v === true ? '' : String(v));

  /* ---- compile the template DOM into a light tree ---- */
  function compile(node) {
    if (node.nodeType === 3) {
      const s = node.nodeValue;
      if (s.indexOf('{{') < 0) return { k: 'text', s };
      return { k: 'expr', s };
    }
    if (node.nodeType !== 1) return null;
    const tag = node.localName;
    const kids = Array.from(node.childNodes).map(compile).filter(Boolean);
    if (tag === 'sc-for') return { k: 'for', list: pathOf(node.getAttribute('list')), as: node.getAttribute('as'), kids };
    if (tag === 'sc-if') return { k: 'if', val: pathOf(node.getAttribute('value')), kids };
    const attrs = [];
    for (const a of Array.from(node.attributes)) {
      if (a.name.indexOf('hint-') === 0) continue;
      const m = WHOLE.exec(a.value);
      attrs.push({ name: a.name, whole: m ? m[1] : null, tpl: m ? null : a.value, dyn: !m && a.value.indexOf('{{') >= 0 });
    }
    return { k: 'el', tag, ns: node.namespaceURI || HTML_NS, attrs, kids };
  }
  function pathOf(s) { const m = WHOLE.exec(s || ''); return m ? m[1] : null; }

  /* ---- evaluate the compiled tree against a scope into a vnode list ---- */
  function evalNodes(nodes, scope, out) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      switch (n.k) {
        case 'text': out.push({ t: '#', s: n.s }); break;
        case 'expr': // interpolated text sits in a span.sc-interp, as in the original render, so span selectors in styles.css match it
          out.push({ t: 'e', tag: 'span', ns: HTML_NS, props: { class: 'sc-interp' }, ev: {}, ref: null,
            kids: [{ t: '#', s: n.s.replace(ANY, (_, p) => textOf(lookup(scope, p))) }] });
          break;
        case 'if': if (lookup(scope, n.val)) evalNodes(n.kids, scope, out); break;
        case 'for': {
          const list = lookup(scope, n.list);
          if (list && list.length) {
            for (let j = 0; j < list.length; j++) {
              const s2 = Object.create(scope); s2[n.as] = list[j];
              evalNodes(n.kids, s2, out);
            }
          }
          break;
        }
        default: out.push(evalElement(n, scope));
      }
    }
    return out;
  }

  function evalElement(n, scope) {
    const props = {}, ev = {};
    let ref = null;
    for (let i = 0; i < n.attrs.length; i++) {
      const a = n.attrs[i];
      let val = a.whole != null ? lookup(scope, a.whole) : a.dyn ? a.tpl.replace(ANY, (_, p) => textOf(lookup(scope, p))) : a.tpl;
      if (a.name === 'ref') { if (typeof val === 'function') ref = val; continue; }
      if (a.name.slice(0, 2) === 'on') {
        if (typeof val === 'function') {
          let name = a.name.slice(2).toLowerCase(); name = EVENT_NAMES[name] || name;
          if (name === 'change' && n.tag === 'input' && !/^(file|checkbox|radio)$/.test(props.type || '')) name = 'input';
          else if (name === 'change' && n.tag === 'textarea') name = 'input';
          ev[name] = val;
        }
        continue;
      }
      if (a.name === 'type') props.type = val;
      props[a.name] = val;
    }
    return { t: 'e', tag: n.tag, ns: n.ns, props, ev, ref, kids: evalNodes(n.kids, scope, []) };
  }

  /* ---- DOM creation and patching ---- */
  function setProp(el, name, val, svg) {
    if (name === 'value') return; // handled after the other props
    if (name === 'style') { el.style.cssText = val == null || val === false ? '' : String(val); return; }
    if (BOOL_ATTRS[name]) { if (val === '' || val) el.setAttribute(name, ''); else el.removeAttribute(name); return; }
    if (val == null || val === false && name.slice(0, 5) !== 'aria-' && name.slice(0, 5) !== 'data-') { el.removeAttribute(name); return; }
    el.setAttribute(name, typeof val === 'boolean' ? String(val) : String(val));
  }
  function applyProps(el, oldP, newP, svg) {
    for (const k in oldP) if (!(k in newP) && k !== 'value') setProp(el, k, null, svg);
    for (const k in newP) if (k !== 'value' && (!(k in oldP) || oldP[k] !== newP[k])) setProp(el, k, newP[k], svg);
    if ('value' in newP) {
      const v = newP.value == null ? '' : String(newP.value);
      if (el.value !== v) el.value = v;
    }
  }
  function applyEvents(el, ev) {
    el.__ev = ev;
    const l = el.__lst || (el.__lst = {});
    for (const name in ev) {
      if (l[name]) continue;
      l[name] = true;
      el.addEventListener(name, (e) => { const f = el.__ev[name]; if (f) f(e); });
    }
  }
  function createDom(v) {
    if (v.t === '#') return (v.dom = document.createTextNode(v.s));
    const el = (v.dom = document.createElementNS(v.ns, v.tag));
    applyProps(el, {}, v.props, v.ns !== HTML_NS);
    applyEvents(el, v.ev);
    for (let i = 0; i < v.kids.length; i++) el.appendChild(createDom(v.kids[i]));
    if ('value' in v.props && v.props.type === 'range') { const s = v.props.value == null ? '' : String(v.props.value); if (el.value !== s) el.value = s; }
    if (v.ref) v.ref(el);
    return el;
  }
  function destroy(v) {
    if (v.t !== 'e') return;
    if (v.ref) v.ref(null);
    for (let i = 0; i < v.kids.length; i++) destroy(v.kids[i]);
  }
  function patch(o, n) {
    if (o.t !== n.t || (o.t === 'e' && (o.tag !== n.tag || o.ns !== n.ns))) {
      const d = createDom(n);
      o.dom.parentNode.replaceChild(d, o.dom);
      destroy(o);
      return;
    }
    n.dom = o.dom;
    if (n.t === '#') { if (o.s !== n.s) o.dom.nodeValue = n.s; return; }
    applyProps(o.dom, o.props, n.props, n.ns !== HTML_NS);
    applyEvents(o.dom, n.ev);
    patchKids(o.dom, o.kids, n.kids);
    if (o.ref !== n.ref) { if (o.ref) o.ref(null); if (n.ref) n.ref(o.dom); }
  }
  function patchKids(el, ok, nk) {
    const m = Math.min(ok.length, nk.length);
    for (let i = 0; i < m; i++) patch(ok[i], nk[i]);
    for (let i = m; i < ok.length; i++) { el.removeChild(ok[i].dom); destroy(ok[i]); }
    for (let i = m; i < nk.length; i++) el.appendChild(createDom(nk[i]));
  }

  /* ---- mount a component ---- */
  function mount(root, Component, templateEl) {
    const holder = templateEl.content || templateEl;
    const tree = Array.from(holder.childNodes).map(compile).filter(Boolean);
    const inst = new Component({});
    let prev = null, queued = false, mounted = false;

    function render() {
      queued = false;
      const vals = inst.renderVals() || {};
      const next = { t: 'e', tag: 'div', ns: HTML_NS, props: { class: 'sc-host' }, ev: {}, ref: null, kids: evalNodes(tree, vals, []) };
      if (!prev) {
        root.appendChild(createDom(next));
      } else {
        patch(prev, next);
      }
      prev = next;
      if (!mounted) { mounted = true; if (inst.componentDidMount) inst.componentDidMount(); }
    }
    inst.__flush = () => { if (!queued) { queued = true; queueMicrotask(render); } };
    render();
    return inst;
  }

  window.DarkroomUI = { mount };
})();
