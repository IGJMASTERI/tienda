/* PAWMI - sesión de cliente y "Mis pedidos".
   Usa el servidor (/api/usuarios/...) si está disponible; si no, guarda en este dispositivo. */
(function () {
  var K_USER = 'chapitas_user', K_TOKEN = 'pawmi_token', K_CUENTAS = 'pawmi_cuentas_local', K_PED = 'pawmi_pedidos_';
  var enc = new TextEncoder();
  function norm(e) { return String(e || '').trim().toLowerCase(); }
  function emailOk(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function sha(t) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(t))); }
  function rnd() { var a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
  async function api(ruta, opts) {
    try {
      var r = await fetch('/api/usuarios/' + ruta, opts);
      if ((r.headers.get('content-type') || '').indexOf('application/json') < 0) return null;
      var d = await r.json();
      if (r.status === 404 || (d && d.codigo === 'sin_kv')) return null;
      return { status: r.status, data: d };
    } catch (e) { return null; }
  }
  function enviar(ruta, cuerpo, token) {
    var h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return api(ruta, { method: 'POST', headers: h, body: JSON.stringify(cuerpo) });
  }
  function guardar(email, token) { localStorage.setItem(K_USER, email); localStorage.setItem(K_TOKEN, token); }
  function cuentas() { try { return JSON.parse(localStorage.getItem(K_CUENTAS) || '{}'); } catch (e) { return {}; } }
  var P = {
    usuario: function () { return localStorage.getItem(K_TOKEN) ? localStorage.getItem(K_USER) : null; },
    modoLocal: function () { return (localStorage.getItem(K_TOKEN) || '').indexOf('local-') === 0; },
    registrar: async function (email, pass) {
      email = norm(email);
      if (!emailOk(email)) return { ok: false, error: 'Escribe un correo válido.' };
      if (String(pass).length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
      var r = await enviar('registro', { email: email, password: pass });
      if (r) {
        if (r.data && r.data.ok) { guardar(email, r.data.token); return { ok: true }; }
        return { ok: false, error: (r.data && r.data.error) || 'No se pudo crear la cuenta.' };
      }
      var c = cuentas();
      if (c[email]) return { ok: false, error: 'Ya existe una cuenta con ese correo en este dispositivo.' };
      var salt = rnd(); c[email] = { salt: salt, hash: await sha(salt + pass) };
      localStorage.setItem(K_CUENTAS, JSON.stringify(c));
      guardar(email, 'local-' + rnd());
      return { ok: true, local: true };
    },
    ingresar: async function (email, pass) {
      email = norm(email);
      if (!emailOk(email) || !pass) return { ok: false, error: 'Escribe tu correo y tu contraseña.' };
      var r = await enviar('login', { email: email, password: pass });
      if (r) {
        if (r.data && r.data.ok) { guardar(email, r.data.token); return { ok: true }; }
        return { ok: false, error: (r.data && r.data.error) || 'Correo o contraseña incorrectos.' };
      }
      var u = cuentas()[email];
      if (!u || (await sha(u.salt + pass)) !== u.hash) return { ok: false, error: 'Correo o contraseña incorrectos.' };
      guardar(email, 'local-' + rnd());
      return { ok: true, local: true };
    },
    salir: function () { localStorage.removeItem(K_USER); localStorage.removeItem(K_TOKEN); },
    pedidos: async function () {
      var u = P.usuario(); if (!u) return [];
      if (!P.modoLocal()) {
        var r = await api('pedidos', { headers: { Authorization: 'Bearer ' + localStorage.getItem(K_TOKEN) } });
        if (r && r.status === 401) { P.salir(); return []; }
        if (r && r.data && r.data.ok) return r.data.pedidos;
      }
      try { return JSON.parse(localStorage.getItem(K_PED + u) || '[]'); } catch (e) { return []; }
    },
    guardarPedidos: async function (lista) {
      var u = P.usuario(); if (!u || !lista.length) return false;
      if (!P.modoLocal()) {
        var r = await enviar('pedidos', { pedidos: lista }, localStorage.getItem(K_TOKEN));
        if (r && r.data && r.data.ok) return true;
      }
      var actuales = []; try { actuales = JSON.parse(localStorage.getItem(K_PED + u) || '[]'); } catch (e) {}
      lista.forEach(function (p) { actuales.push({ id: p.id, mascota: p.mascota, producto: p.producto || 'Placa NFC', total: p.total || 0, fecha: new Date().toISOString(), estado: 'Recibido' }); });
      localStorage.setItem(K_PED + u, JSON.stringify(actuales));
      return true;
    }
  };
  window.PAWMI = P;
})();
