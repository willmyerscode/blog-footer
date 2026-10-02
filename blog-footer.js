/* Blog Footer 1.1.0-preview — Copyright Will Myers. All rights reserved. */
(function (root) {
  'use strict';
  const VERSION = '1.1.0-preview';
  const TOOLKIT = 'https://cdn.jsdelivr.net/gh/willmyerscode/toolkit@v1.0.32/index.js';
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const pathKey = value => value.replace(/\/+$/, '') || '/';

  function resolveSettings(config, context) {
    const settings = {source: '', disabled: false, layout: 'sections', target: '', placement: ''};
    const matched = [];
    if (!isObject(config)) return {...settings, matched};
    const apply = (rule, label) => {
      if (!isObject(rule)) return;
      if (typeof rule.source === 'string') settings.source = rule.source.trim();
      if (typeof rule.disabled === 'boolean') settings.disabled = rule.disabled;
      if (['sections', 'inline'].includes(rule.layout)) settings.layout = rule.layout;
      for (const name of ['target', 'placement']) {
        if (typeof rule[name] === 'string') settings[name] = rule[name].trim();
      }
      matched.push(label);
    };
    apply(config.defaults, 'defaults');
    for (const group of ['categories', 'tags']) {
      const names = new Set((context[group] || []).filter(name => typeof name === 'string').map(name => name.trim()));
      if (!isObject(config[group])) continue;
      for (const [name, rule] of Object.entries(config[group])) {
        if (names.has(name.trim())) apply(rule, `${group}: ${name}`);
      }
    }
    if (isObject(config.urls)) {
      for (const [path, rule] of Object.entries(config.urls)) {
        if (path.startsWith('/') && !path.startsWith('//') && !/[?#]/.test(path) && pathKey(path) === pathKey(context.pathname)) {
          apply(rule, `urls: ${path}`);
        }
      }
    }
    return {...settings, matched};
  }

  function sourceURL(source, currentURL) {
    if (typeof source !== 'string' || !source.trim()) return null;
    try {
      const current = new URL(currentURL);
      const url = new URL(source.trim(), current.origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== current.origin || url.username || url.password) return null;
      if (pathKey(url.pathname) === pathKey(current.pathname)) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  }

  // The same pure rule functions run in the browser and in Node's built-in tests.
  if (typeof module === 'object' && module.exports) module.exports = {resolveSettings, sourceURL};
  if (!root?.document) return;
  if (root.wmBlogFooter?.version === VERSION) { root.wmBlogFooter.init(); return; }
  root.wmBlogFooter?.dispose?.();
  const doc = root.document;
  let instance = null, toolkitPromise = null, observer, scheduled = false, disposed = false;
  let lifecycle = Promise.resolve();
  let observedPost, observedPath, observedEditor;
  const metadata = new Map();
  const isEditing = () => doc.body?.classList.contains('sqs-edit-mode-active');
  const getPost = () => doc.querySelector('.blog-item-wrapper');
  const emit = (host, name, detail) => host.dispatchEvent(new CustomEvent(`wmBlogFooter:${name}`, {bubbles: true, detail}));
  const active = current => instance === current && current.post.isConnected && current.path === root.location.pathname && !isEditing();
  const api = {version: VERSION, init, destroy, dispose, state: {status: 'idle'}};
  root.wmBlogFooter = api;

  function destroy() {
    if (!instance) return;
    const old = instance;
    instance = null;
    old.controller.abort();
    if (old.host) {
      emit(old.host, 'destroy', {source: old.source});
      old.host.remove();
    }
    api.state = {...api.state, status: 'idle'};
  }

  async function request(url, signal, json = false) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, 15000);
    try {
      const response = await fetch(url, {signal: controller.signal, credentials: 'same-origin'});
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
      if (new URL(response.url).origin !== root.location.origin) throw new Error('Source must stay on this website');
      return await (json ? response.json() : response.text());
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }

  async function postContext(current, config) {
    const context = {pathname: current.path};
    for (const [group, selector] of [['categories', '.blog-item-category'], ['tags', '.blog-item-tag']]) {
      context[group] = [...current.post.querySelectorAll(selector)].map(el => el.textContent.trim());
    }
    // Read all labels even when Site Styles hides them from the post.
    if (['categories', 'tags'].some(group => isObject(config?.[group]) && Object.keys(config[group]).length)) {
      try {
        let item = metadata.get(current.path);
        if (!item) {
          const url = new URL(current.path, root.location.origin);
          url.searchParams.set('format', 'json');
          const data = await request(url.href, current.controller.signal, true);
          item = data.item;
          if (isObject(item)) metadata.set(current.path, item);
        }
        for (const group of ['categories', 'tags']) if (Array.isArray(item?.[group])) context[group] = item[group];
      } catch (error) {
        if (active(current)) console.warn('[Blog Footer] Could not read all post labels. Using the labels in the page.', error);
      }
    }
    return context;
  }

  function toolkit() {
    if (typeof root.wm$?.reloadSquarespaceLifecycle === 'function') return Promise.resolve(root.wm$);
    if (toolkitPromise) return toolkitPromise;
    toolkitPromise = new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      const timer = setTimeout(() => finish(new Error('Squarespace toolkit did not load in time')), 15000);
      const finish = error => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) {script.remove(); reject(error);} else resolve(root.wm$);
      };
      script.src = TOOLKIT;
      script.async = true;
      script.onload = () => typeof root.wm$?.reloadSquarespaceLifecycle === 'function'
        ? finish() : finish(new Error('Squarespace toolkit is unavailable'));
      script.onerror = () => finish(new Error('Squarespace toolkit could not load'));
      doc.head.append(script);
    }).catch(error => {toolkitPromise = null; throw error;});
    return toolkitPromise;
  }

  function init() {
    if (disposed) return Promise.resolve();
    const post = getPost();
    if (!post || isEditing()) {
      destroy();
      api.state = {status: isEditing() ? 'editing' : 'not-a-post'};
      return Promise.resolve();
    }
    let config, key;
    try {
      // Snapshot the settings so an in-flight load cannot mix two configurations.
      key = JSON.stringify(root.blogFooter ?? null);
      config = JSON.parse(key);
    } catch {
      destroy(); api.state = {status: 'invalid-settings'}; return Promise.resolve();
    }
    if (instance?.post === post && instance.path === root.location.pathname && instance.key === key) return instance.promise;
    destroy();
    const current = {post, path: root.location.pathname, key, controller: new AbortController(), host: null};
    instance = current;
    current.promise = render(current, config);
    return current.promise;
  }

  async function render(current, config) {
    try {
      const context = await postContext(current, config);
      if (!active(current)) return;
      const settings = resolveSettings(config, context);
      api.state = {...settings, status: 'loading'};
      if (settings.disabled || !settings.source) {
        api.state.status = settings.disabled ? 'disabled' : 'no-source';
        return;
      }
      current.source = sourceURL(settings.source, root.location.href);
      if (!current.source) {api.state.status = 'invalid-source'; return;}
      const html = await request(current.source, current.controller.signal);
      if (!active(current)) return;
      const page = new DOMParser().parseFromString(html, 'text/html');
      const region = page.querySelector('main #sections, main #page-regions, main#sections, #page > #sections, #sections, #page-regions');
      const sections = region ? [...region.querySelectorAll('section.page-section')] : [];
      if (!sections.length || page.querySelector('.blog-item-wrapper')) throw new Error('Choose an enabled layout page with at least one section');
      // Resolve defaults after the cascade so changing layout also changes its defaults.
      const content = settings.target
        ? [page.querySelector(settings.target)].filter(Boolean)
        : settings.layout === 'inline'
          ? [sections[0].querySelector('.content-wrapper')].filter(Boolean)
          : sections;
      if (!content.length) throw new Error('The source target did not match any content');
      if (content.some(el => el.matches('script, style, link, meta, html, head, body')))
        throw new Error('Choose a content element as the source target');
      const placement = settings.placement
        ? doc.querySelector(settings.placement)
        : settings.layout === 'inline'
          ? current.post.querySelector('.blog-item-content-wrapper > .blog-item-content')
          : (current.post.closest('section') || current.post);
      if (!placement?.parentElement || placement.matches('html, head, body'))
        throw new Error('The placement did not match a valid element');
      const runtime = await toolkit();
      if (!active(current)) return;
      const host = doc.createElement('div');
      host.dataset.wmPlugin = 'blog-footer';
      host.dataset.wmBlogFooterHost = '';
      host.dataset.source = settings.source;
      host.dataset.layout = settings.layout;
      host.dataset.state = 'loading';
      host.id = 'wm-blog-footer';
      current.host = host;
      for (const section of content) {
        section.removeAttribute('data-page-sections');
        section.querySelectorAll('[data-page-sections]').forEach(el => el.removeAttribute('data-page-sections'));
        // Code blocks remain visible, but fetched scripts are never executed here.
        section.querySelectorAll('script').forEach(el => el.remove());
        host.append(section);
      }
      if (!placement.isConnected) throw new Error('The placement is no longer on the page');
      placement.after(host);
      emit(host, 'beforeInit', {settings, matched: settings.matched});
      // Serialize our native initialization across rapid settings/navigation changes.
      lifecycle = lifecycle.catch(() => {}).then(async () => {
        if (active(current) && host.isConnected) await runtime.reloadSquarespaceLifecycle([host]);
      });
      await lifecycle;
      if (!active(current) || !host.isConnected) return;
      host.dataset.state = 'ready';
      api.state.status = 'ready';
      emit(host, 'afterInit', {settings, matched: settings.matched});
      if (root.location.hash === '#wm-blog-footer') host.scrollIntoView({block: 'start'});
    } catch (error) {
      if (!active(current)) return;
      destroy();
      api.state = {...api.state, status: 'error'};
      console.warn('[Blog Footer] The footer could not load. The blog post is unchanged.', error);
    }
  }

  function onPageChange() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {scheduled = false; init();});
  }
  function start() {
    if (disposed) return;
    observedPost = getPost(); observedPath = root.location.pathname; observedEditor = isEditing();
    observer = new MutationObserver(() => {
      const post = getPost(), path = root.location.pathname, editor = isEditing();
      if (post !== observedPost || path !== observedPath || editor !== observedEditor) {
        observedPost = post; observedPath = path; observedEditor = editor; onPageChange();
      }
    });
    observer.observe(doc.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['class']});
    doc.addEventListener('mercury:load', onPageChange);
    root.addEventListener('popstate', onPageChange);
    root.addEventListener('pageshow', onPageChange);
    init();
  }
  function dispose() {
    disposed = true;
    destroy(); observer?.disconnect();
    doc.removeEventListener('DOMContentLoaded', start);
    doc.removeEventListener('mercury:load', onPageChange);
    root.removeEventListener('popstate', onPageChange);
    root.removeEventListener('pageshow', onPageChange);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})(typeof window === 'undefined' ? null : window);
