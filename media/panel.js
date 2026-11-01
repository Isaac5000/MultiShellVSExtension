'use strict';
(() => {
  const vscode = acquireVsCodeApi();
  const es = {
    subtitle: 'Centro de control MCP',
    refresh: 'Actualizar',
    hub: 'Coordinador',
    worker: 'Trabajador',
    offline: 'Desconectado',
    online: 'En línea',
    start: 'Iniciar',
    stop: 'Detener',
    connected: 'Conectado',
    currentWindow: 'VENTANA ACTUAL',
    windowIdShort: 'ID DE VENTANA',
    workspace: 'Proyecto',
    copyWindow: 'Copiar ID de ventana',
    shells: 'Terminales',
    shellsLabel: 'SESIONES',
    connectedWindows: 'Ventanas',
    windowsHelp: 'Conectadas al mismo servidor MCP',
    new: 'Nueva',
    createTitle: 'Nueva terminal',
    identifier: 'IDENTIFICADOR',
    directory: 'DIRECTORIO DE TRABAJO',
    directoryPlaceholder: 'Ej.: src, ../otro-proyecto o C:\\ruta',
    directoryHelp: 'Se aceptan rutas relativas al proyecto de esta ventana o rutas absolutas. En blanco usa la raíz del proyecto.',
    allowShare:
      'Compartir directorio con otra terminal (puede provocar conflictos)',
    cancel: 'Cancelar',
    create: 'Crear terminal',
    search: 'Filtrar terminales…',
    noShells: 'No hay terminales',
    noShellsHelp: 'Inicia el servidor para crear tu primera terminal.',
    noResults: 'Sin coincidencias',
    noResultsHelp: 'Prueba con otro identificador.',
    noWindows: 'No hay ventanas conectadas',
    primaryTag: 'Principal',
    primaryLabel: 'Terminal principal',
    originUser: 'Usuario',
    originMcp: 'MCP',
    originAutomatic: 'Automática',
    timedOutRunning: 'Tiempo agotado · proceso conservado',
    recoveredShell: 'Recuperada · confirma que está libre',
    enableRestored: 'Volver a habilitar MCP',
    restoredReady: 'Terminal restaurada y disponible',
    queued: 'En cola',
    busy: 'Ocupada',
    idle: 'Disponible',
    show: 'Abrir terminal',
    copy: 'Copiar identificador',
    copied: 'Copiado al portapapeles',
    copyInstruction: 'Copiar instrucción corta para ChatGPT',
    editAlias: 'Cambiar alias',
    aliasSaved: 'Alias actualizado',
    copySelector: 'Copiar shell=alias',
    close: 'Cerrar terminal',
    confirmClose:
      '¿Cerrar esta terminal? Se interrumpirán los comandos que siga ejecutando.',
    created: 'Terminal creada',
    closed: 'Terminal cerrada',
    closeCancelled: 'Cierre cancelado',
    you: 'ESTA VENTANA',
    local: 'Actual',
    language: 'IDIOMA',
    auto: 'Automático (VSCode)',
    usageTitle: 'Cómo vincular un chat',
    isolation:
      'Usa el alias visible en cada terminal. En ChatGPT basta escribir «shell=1: ejecuta ls» o «shell=minecraft: compila». Las operaciones siguen identificando el shell explícitamente; no se comparte una selección global entre chats.',
    error: 'Error',
    notAvailable: 'No disponible',
    sessions: 'sesiones',
    copyId: 'Copiar ID',
    more: 'Más acciones',
    project: 'Proyecto',
    noProject: 'Sin proyecto',
    portLabel: 'PUERTO MCP',
    savePort: 'Aplicar',
    portHelp: 'Compartido entre ventanas. Al cambiarlo se reinicia MultiShell MCP; actualiza también el túnel externo.',
    portSaved: 'Configuración guardada. Se está aplicando el nuevo puerto.',
    invalidPort: 'El puerto debe estar entre 1024 y 65535.',
    commandLine: 'MCP · puerto',
    windowOffline: 'Inicia MultiShell MCP en esta ventana',
    countOne: 'terminal',
    countMany: 'terminales',
    requests: 'Solicitudes',
    pendingRequests: 'SOLICITUDES PENDIENTES',
    requestsHelp: 'La IA no puede autorizar su propia solicitud',
    noRequests: 'No hay solicitudes pendientes',
    approveRequest: 'Autorizar creación',
    rejectRequest: 'Rechazar',
    requestExpires: 'Caduca',
    windowInteractive: 'Salir automáticamente de comandos interactivos en esta ventana',
    windowInteractiveHelp: 'Activado por defecto. Solo programas conocidos; cada terminal puede tener una excepción.',
    enableAutoExit: 'Activar salida automática',
    disableAutoExit: 'Desactivar salida automática',
    inheritAutoExit: 'Utilizar ajuste de ventana'
  };
  const en = {
    subtitle: 'MCP control center',
    refresh: 'Refresh',
    hub: 'Hub',
    worker: 'Worker',
    offline: 'Disconnected',
    online: 'Online',
    start: 'Start',
    stop: 'Stop',
    connected: 'Connected',
    currentWindow: 'CURRENT WINDOW',
    windowIdShort: 'WINDOW ID',
    workspace: 'Workspace',
    copyWindow: 'Copy window ID',
    shells: 'Terminals',
    shellsLabel: 'SESSIONS',
    connectedWindows: 'Windows',
    windowsHelp: 'Connected to the same MCP server',
    new: 'New',
    createTitle: 'New terminal',
    identifier: 'IDENTIFIER',
    directory: 'WORKING DIRECTORY',
    directoryPlaceholder: 'e.g. src, ../another-project or /home/user/project',
    directoryHelp: 'Relative paths start at this VSCode workspace. Absolute paths are also valid. Blank uses the workspace root.',
    allowShare: 'Share a directory with another terminal (may cause conflicts)',
    cancel: 'Cancel',
    create: 'Create terminal',
    search: 'Filter terminals…',
    noShells: 'No terminals yet',
    noShellsHelp: 'Start the server to create your first terminal.',
    noResults: 'No matches',
    noResultsHelp: 'Try a different identifier.',
    noWindows: 'No connected windows',
    primaryTag: 'Primary',
    primaryLabel: 'Main terminal',
    originUser: 'User',
    originMcp: 'MCP',
    originAutomatic: 'Automatic',
    timedOutRunning: 'Timed out · process preserved',
    recoveredShell: 'Restored · confirm it is idle',
    enableRestored: 'Re-enable MCP',
    restoredReady: 'Terminal restored and available',
    queued: 'Queued',
    busy: 'Busy',
    idle: 'Available',
    show: 'Open terminal',
    copy: 'Copy identifier',
    copied: 'Copied to clipboard',
    copyInstruction: 'Copy short ChatGPT instruction',
    editAlias: 'Change alias',
    aliasSaved: 'Alias updated',
    copySelector: 'Copy shell=alias',
    close: 'Close terminal',
    confirmClose:
      'Close this terminal? Any running commands will be interrupted.',
    created: 'Terminal created',
    closed: 'Terminal closed',
    closeCancelled: 'Close cancelled',
    you: 'THIS WINDOW',
    local: 'Current',
    language: 'LANGUAGE',
    auto: 'Automatic (VSCode)',
    usageTitle: 'How to connect a chat',
    isolation:
      'Use each terminal’s short alias. In ChatGPT, type “shell=1: run ls” or “shell=minecraft: build”. Operations explicitly select a shell; conversations do not share a global selection.',
    error: 'Error',
    notAvailable: 'Not available',
    sessions: 'sessions',
    copyId: 'Copy ID',
    more: 'More actions',
    project: 'Project',
    noProject: 'No workspace',
    portLabel: 'MCP PORT',
    savePort: 'Apply',
    portHelp: 'Shared by all windows. Changing it restarts MultiShell MCP; update your external tunnel separately.',
    portSaved: 'Setting saved. Applying the new port.',
    invalidPort: 'Port must be between 1024 and 65535.',
    commandLine: 'MCP · port',
    windowOffline: 'Start MultiShell MCP in this window',
    countOne: 'terminal',
    countMany: 'terminals',
    requests: 'Requests',
    pendingRequests: 'PENDING REQUESTS',
    requestsHelp: 'The AI cannot approve its own request',
    noRequests: 'No pending requests',
    approveRequest: 'Approve creation',
    rejectRequest: 'Deny',
    requestExpires: 'Expires',
    windowInteractive: 'Automatically exit interactive commands in this window',
    windowInteractiveHelp: 'Enabled by default. Only known programs; each terminal can override it.',
    enableAutoExit: 'Enable automatic exit',
    disableAutoExit: 'Disable automatic exit',
    inheritAutoExit: 'Use window setting'
  };

  const glyphs = {
    refresh: [
      'M20 11a8 8 0 0 0-14-5M4 4v6h6',
      'M4 13a8 8 0 0 0 14 5m2 2v-6h-6'
    ],
    folder: [
      'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z'
    ],
    terminal: ['m4 6 6 6-6 6', 'M12 18h8'],
    plus: ['M12 5v14', 'M5 12h14'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    copy: [
      'M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2',
      'M10 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z'
    ],
    monitor: [
      'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
      'M8 22h8',
      'M12 18v4'
    ],
    search: ['m21 21-4.5-4.5', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z'],
    info: [
      'M12 16v-4',
      'M12 8h.01',
      'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'
    ],
    chevron: ['m6 9 6 6 6-6'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    'check-circle': ['M20 6 9 17l-5-5', 'M22 12a10 10 0 1 1-10-10'],
    'log-out': [
      'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
      'M16 17l5-5-5-5',
      'M21 12H9'
    ],
    'shield-check': [
      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
      'm9 12 2 2 4-4'
    ],
    message: [
      'M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5Z'
    ],
    trash: [
      'M3 6h18',
      'M8 6V4h8v2',
      'M6 6l1 14h10l1-14',
      'M10 10v7',
      'M14 10v7'
    ],
    external: [
      'M14 3h7v7',
      'M10 14 21 3',
      'M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6'
    ]
  };
  function makeIcon(key) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of glyphs[key] || glyphs.terminal) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
    return svg;
  }
  function insertIcons(parent = document) {
    // Icons are generated from bundled SVG paths; never from workspace text.
    for (const node of parent.querySelectorAll('[data-icon]')) {
      if (node.dataset.iconReady) {continue;}
      node.replaceChildren(makeIcon(node.dataset.icon));
      node.dataset.iconReady = 'true';
    }
  }
  const $ = id => document.getElementById(id);
  let locale = 'en';
  let state = { running: false, port: 3000 };
  let activePage = 'shells';
  let formOpen = false;
  let search = '';
  let toastTimer;
  let openMenu = null;
  let busyAction = false;
  let portBusy = false;
  const closingIds = new Set();
  const t = key => (locale === 'es' ? es : en)[key] || key;
  const send = (type, more = {}) =>
    vscode.postMessage(Object.assign({ type }, more));
  function el(tag, classes, text) {
    const node = document.createElement(tag);
    if (classes) {node.className = classes;}
    if (text !== undefined) {node.textContent = text;}
    return node;
  }
  function commandButton(key, title, onclick, danger = false) {
    const b = el(
      'button',
      'icon-button row-action' + (danger ? ' danger' : '')
    );
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.append(makeIcon(key));
    b.addEventListener('click', onclick);
    return b;
  }
  function menuButton(key, label, callback, danger = false) {
    const b = el('button', 'menu-option' + (danger ? ' danger' : ''));
    b.type = 'button';
    b.append(makeIcon(key), el('span', null, label));
    b.addEventListener('click', callback);
    return b;
  }
  function requestClose(shell) {
    const id=shell.shell_id;
    if(closingIds.has(id)) {return;}
    closingIds.add(id);
    send('close',{id});
    renderShells();
  }
  function copyInstruction(shell) {
    const selector=shell.alias||shell.shell_id;
    send('copy',{value:locale==='es'
      ? 'Usa shell='+selector+' para esta conversación.'
      : 'Use shell='+selector+' for this conversation.'});
  }
  function notify(message, isError = false) {
    const node = $('notice');
    node.textContent = message;
    node.hidden = false;
    node.classList.toggle('error', isError);
    if (toastTimer) {clearTimeout(toastTimer);}
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 3800);
  }
  function baseName(p) {
    if (!p) {return t('noProject');}
    const parts = p.split(/[\\/]/).filter(Boolean);
    return parts.at(-1) || p;
  }
  function localize() {
    document.documentElement.lang = locale;
    for (const node of document.querySelectorAll('[data-i18n]'))
      {node.textContent = t(node.dataset.i18n);}
    for (const node of document.querySelectorAll('[data-aria-i18n]')) {
      node.setAttribute('aria-label', t(node.dataset.ariaI18n));
      node.title = t(node.dataset.ariaI18n);
    }
    for (const node of document.querySelectorAll('[data-placeholder-i18n]')) {
      node.placeholder = t(node.dataset.placeholderI18n);
    }
    $('searchShells').setAttribute('aria-label', t('search'));
  }
  function drawHeader() {
    $('connection').classList.toggle('online', !!state.running);
    $('connection').classList.toggle('offline', !state.running);
    $('role').textContent = state.running
      ? t(state.role === 'hub' ? 'hub' : 'worker')
      : t('offline');
    $('connectionDetail').textContent = state.running
      ? t('commandLine') + ' ' + (state.activePort || state.port || 3000)
      : t('windowOffline');
    $('toggle').textContent = t(state.running ? 'stop' : 'start');
    $('toggle').disabled = busyAction;
    const portInput=$('portInput');
    if(document.activeElement!==portInput && !portBusy){portInput.value=String(state.port||3000);}
    const newPort=Number(portInput.value);
    $('savePort').disabled=portBusy||!Number.isInteger(newPort)||newPort<1024||newPort>65535||
      newPort===state.port;
    $('workspaceName').textContent = state.running
      ? baseName(state.workspace)
      : t('noProject');
    $('workspace').textContent = state.workspace || '—';
    $('workspace').title = state.workspace || '';
    $('windowId').textContent = state.windowId || '—';
    $('windowId').title = state.windowId || '';
    $('copyWindow').disabled = !state.windowId;
    $('shellCount').textContent = String((state.shells || []).length);
    $('windowCount').textContent = String((state.windows || []).length);
    $('requestsCount').textContent = String((state.requests || []).length);
    $('windowInteractive').checked = state.windowAutoExit !== false;
    $('windowInteractive').disabled = !state.running;
    for (const field of $('shellForm').elements)
      {field.disabled = !state.running;}
    $('newShell').disabled = !state.running;
    $('newShell').setAttribute('aria-expanded', String(formOpen));
    $('newShell').classList.toggle('selected', formOpen);
    $('createPanel').hidden = !formOpen || !state.running;
  }
  function renderShells() {
    const target = $('shells');
    target.replaceChildren();
    const all = (state.shells || []).slice().sort((a, b) => {
      if (a.shell_id === state.primary) {return -1;}
      if (b.shell_id === state.primary) {return 1;}
      return a.shell_id.localeCompare(b.shell_id);
    });
    $('shellMeta').textContent =
      String(all.length) + ' ' + t(all.length === 1 ? 'countOne' : 'countMany');
    $('searchRow').hidden = all.length < 5;
    const shown = all.filter(
      s =>
        (s.alias||'').toLowerCase().includes(search.toLowerCase()) || s.shell_id.toLowerCase().includes(search.toLowerCase()) ||
        s.initial_cwd.toLowerCase().includes(search.toLowerCase())
    );
    const noItems = shown.length === 0;
    $('shellEmpty').hidden = !noItems;
    $('shellEmptyTitle').textContent = t(all.length ? 'noResults' : 'noShells');
    $('shellEmptyHint').textContent = t(
      all.length ? 'noResultsHelp' : 'noShellsHelp'
    );
    for (const shell of shown) {
      const primary = shell.shell_id === state.primary;
      const item = el('div', 'shell-row' + (primary ? ' is-primary' : ''), '');
      item.setAttribute('role', 'listitem');
      item.classList.toggle('is-closing',closingIds.has(shell.shell_id));
      item.classList.toggle('menu-open',openMenu===shell.shell_id);
      const open = el('button', 'row-main');
      open.type = 'button';
      open.title = t('show');
      open.setAttribute('aria-label', t('show') + ': ' + shell.shell_id);
      const leading = el('span', 'terminal-icon');
      leading.append(makeIcon('terminal'));
      const details = el('span', 'row-details');
      const nameLine = el('span', 'row-title');
      nameLine.append(
        el('span', 'row-name', primary ? t('primaryLabel') : (shell.alias || shell.shell_id))
      );
      const aliasLine = el('span', 'shell-alias', 'shell='+(shell.alias||shell.shell_id));
      aliasLine.title = 'shell='+(shell.alias||shell.shell_id);
      if (primary)
        {nameLine.append(el('span', 'primary-indicator', t('primaryTag')));}
      if (!primary && shell.origin)
        {nameLine.append(el('span', 'origin-indicator', t(shell.origin === 'user' ? 'originUser' : shell.origin === 'automatic' ? 'originAutomatic' : 'originMcp')));}
      const idLine = el(
        'span',
        'shell-id subline',
        shell.shell_id
      );
      idLine.title = primary ? shell.shell_id : shell.initial_cwd;
      const status = el(
        'span',
        'row-status' + (shell.busy ? ' running' : ''),
        t(shell.recovery_required ? 'recoveredShell' : shell.timed_out_running ? 'timedOutRunning' : shell.busy ? 'busy' : 'idle')
      );
      if (shell.queued > 0)
        {status.textContent += ' · ' + t('queued') + ': ' + shell.queued;}
      details.append(nameLine, aliasLine, idLine, status);
      open.append(leading, details);
      open.addEventListener('click', () =>
        send('show', { id: shell.shell_id })
      );
      const actions = el('div', 'row-actions');
      actions.append(
        commandButton('copy', t('copySelector'), () =>
          send('copy', { value: 'shell='+(shell.alias||shell.shell_id) })
        )
      );
      actions.append(commandButton('message', t('copyInstruction'), () => copyInstruction(shell)));
      if((shell.recovery_required || shell.timed_out_running)){
        const restore=commandButton('shield-check',t('enableRestored'),()=>send('confirm_restore',{id:shell.shell_id}));
        actions.append(restore);
      }
      if (!primary) {
        const remove = commandButton('trash', t('close'), () => requestClose(shell), true);
        remove.classList.add('quick-close');
        actions.append(remove);
      }
      const overflow = el('div', 'overflow');
      const more = commandButton('more', t('more'), () => {
        openMenu = openMenu === shell.shell_id ? null : shell.shell_id;
        renderShells();
      });
      more.setAttribute('aria-expanded', String(openMenu === shell.shell_id));
      overflow.append(more);
      if (openMenu === shell.shell_id) {
        const options = el('div', 'popup-menu');
        options.append(
          menuButton('message', t('copyInstruction'), () => {
            openMenu = null;
            copyInstruction(shell);
            renderShells();
          })
        );
        options.append(
          menuButton('terminal', t('editAlias'), () => {
            openMenu=null;
            send('alias', {id:shell.shell_id});
            renderShells();
          })
        );
        options.append(
          menuButton('external', t('show'), () => {
            openMenu = null;
            send('show', { id: shell.shell_id });
            renderShells();
          })
        );
        options.append(menuButton(
          'log-out',
          t(shell.auto_exit_interactive===false?'enableAutoExit':'disableAutoExit'),
          ()=>{
            openMenu=null;
            send('shell_interactive',{id:shell.shell_id,value:shell.auto_exit_interactive===false});
            renderShells();
          }
        ));
        if(typeof shell.auto_exit_override==='boolean'){
          options.append(menuButton('refresh',t('inheritAutoExit'),()=>{
            openMenu=null;
            send('shell_interactive',{id:shell.shell_id,value:null});
            renderShells();
          }));
        }
        if (!primary)
          {options.append(
            menuButton(
              'trash',
              t('close'),
              () => {
                openMenu = null;
                requestClose(shell);
                renderShells();
              },
              true
            )
          );}
        overflow.append(options);
      }
      actions.append(overflow);
      item.append(open, actions);
      target.append(item);
    }
  }
  function renderWindows() {
    const target = $('windows');
    target.replaceChildren();
    const windows = state.windows || [];
    $('windowEmpty').hidden = windows.length !== 0;
    for (const win of windows) {
      const here = win.window_id === state.windowId;
      const row = el('div', 'window-row' + (here ? ' is-current' : ''), '');
      row.setAttribute('role', 'listitem');
      const icon = el('span', 'window-icon');
      icon.append(makeIcon('monitor'));
      const center = el('div', 'window-info');
      const line = el('div', 'window-title');
      line.append(el('strong', null, baseName(win.workspace)));
      if (here) {line.append(el('span', 'current-tag', t('you')));}
      const id = el('div', 'window-id mono', win.window_id);
      const dir = el('div', 'window-dir', win.workspace);
      id.title = win.window_id;
      dir.title = win.workspace;
      center.append(line, id, dir);
      row.append(
        icon,
        center,
        commandButton('copy', t('copyWindow'), () =>
          send('copy', { value: win.window_id })
        )
      );
      target.append(row);
    }
  }
  function renderRequests() {
    const target=$('requestsList');
    target.replaceChildren();
    const pending=state.requests||[];
    $('requestsEmpty').hidden=pending.length!==0;
    for(const request of pending){
      const row=el('div','approval-request');
      row.setAttribute('role','listitem');
      row.append(el('strong','request-id',request.shell_id));
      row.append(el('div','subline path',request.cwd));
      row.append(el('div','subline',t('allowShare')+': '+(request.share?'✓':'—')));
      const actions=el('div','request-actions');
      const approve=el('button','add-button',t('approveRequest'));
      approve.type='button';
      approve.addEventListener('click',()=>send('request_decision',{id:request.request_id,value:true}));
      const deny=el('button','quiet',t('rejectRequest'));
      deny.type='button';
      deny.addEventListener('click',()=>send('request_decision',{id:request.request_id,value:false}));
      actions.append(approve,deny);
      row.append(actions);
      target.append(row);
    }
  }
  function switchPage(target) {
    activePage = target;
    for(const [key,tab,page] of [
      ['shells','tabShells','shellsPage'],
      ['windows','tabWindows','windowsPage'],
      ['requests','tabRequests','requestsPage']
    ]){
      $(tab).setAttribute('aria-selected',String(target===key));
      $(page).hidden=target!==key;
    }
    if(target==='shells'){renderShells();}
    else if(target==='windows'){renderWindows();}
    else{renderRequests();}
  }
  function draw() {
    localize();
    drawHeader();
    renderShells();
    renderWindows();
    renderRequests();
    switchPage(activePage);
  }
  function setForm(open) {
    formOpen = open;
    $('createPanel').hidden = !formOpen || !state.running;
    $('newShell').classList.toggle('selected', formOpen);
    $('newShell').setAttribute('aria-expanded', String(formOpen));
    if (open) {$('shellId').focus();}
  }
  function handleTabKeys(event) {
    if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight'){return;}
    event.preventDefault();
    const tabs=['shells','windows','requests'];
    const index=tabs.indexOf(activePage);
    const next=tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];
    switchPage(next);
    $({shells:'tabShells',windows:'tabWindows',requests:'tabRequests'}[next]).focus();
  }
  insertIcons();
  $('refresh').addEventListener('click', () => send('refresh'));
  $('portInput').addEventListener('input',drawHeader);
  $('portForm').addEventListener('submit',event=>{
    event.preventDefault();
    const port=Number($('portInput').value);
    if(!Number.isInteger(port)||port<1024||port>65535){notify(t('invalidPort'),true);return;}
    if(port===state.port){return;}
    portBusy=true;
    drawHeader();
    send('port',{value:port});
  });
  $('toggle').addEventListener('click', () => {
    busyAction = true;
    drawHeader();
    send('toggle');
  });
  $('copyWindow').addEventListener('click', () => {
    if (state.windowId) {send('copy', { value: state.windowId });}
  });
  $('tabShells').addEventListener('click', () => switchPage('shells'));
  $('tabWindows').addEventListener('click', () => switchPage('windows'));
  $('tabRequests').addEventListener('click', () => switchPage('requests'));
  $('windowInteractive').addEventListener('change',event=>{
    send('window_interactive',{value:event.target.checked});
  });
  $('tabShells').addEventListener('keydown', handleTabKeys);
  $('tabWindows').addEventListener('keydown', handleTabKeys);
  $('tabRequests').addEventListener('keydown', handleTabKeys);
  $('newShell').addEventListener('click', () => setForm(!formOpen));
  $('cancelCreate').addEventListener('click', () => setForm(false));
  $('formCancel').addEventListener('click', () => setForm(false));
  $('searchShells').addEventListener('input', event => {
    search = event.target.value;
    renderShells();
  });
  $('shellForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = $('shellId').value.trim();
    const cwd = $('cwd').value.trim();
    send('create', { id, cwd, share: $('share').checked });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (openMenu) {
        openMenu = null;
        renderShells();
      } else if (formOpen) {setForm(false);}
    }
  });
  document.addEventListener('click', event => {
    if (openMenu && !event.target.closest('.overflow')) {
      openMenu = null;
      renderShells();
    }
  });
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object') {return;}
    if (data.type === 'state') {
      state = data.snapshot || { running: false };
      const active=new Set((state.shells||[]).map(shell=>shell.shell_id));
      for(const id of closingIds){if(!active.has(id)){closingIds.delete(id);}}
      locale = data.language === 'es' ? 'es' : 'en';
      busyAction = false;
      draw();
    } else if (data.type === 'notice') {
      if(data.key==='portSaved'){portBusy=false;send('refresh');}
      notify(t(data.key));
      if (data.key === 'closed') {closingIds.clear();}
      if (data.key === 'created') {
        $('shellForm').reset();
        setForm(false);
      }
    } else if (data.type === 'closeCancelled') {
      closingIds.delete(data.id);
      renderShells();
    } else if (data.type === 'error') {
      portBusy=false;
      closingIds.clear();
      busyAction = false;
      drawHeader();
      notify(t('error') + ': ' + data.text, true);
    }
  });
  draw();
  send('refresh');
})();