// Sign in / Create account, shown before the city picker and the game ("Sailo Sign In" design pack).
// By day the form sits straight on the sunny scene; at night it's a frosted card by the lamp-lit tug.
// The tug is live (signin-scene.js): tap the water to steer, tap the tug for a splash, typing throws
// bow spray, the lamp goes out while you type a password, and signing in sails the tug off.
// Accounts are real (auth.js / Supabase Auth); "Sail as a guest" skips signing in on this device.
import './signin.css';
import { signIn, signUp, sendReset, setPassword, oauth, sailAsGuest, captainName, fromRedirect, currentSession, isGuest } from './auth.js';
import { savedChart } from './chart-store.js';

const SETTINGS = 'sailo:settings';
const setCaptain = name => { try { const s = JSON.parse(localStorage.getItem(SETTINGS)) || {}; s.name = name; localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { /* storage blocked */ } };
const native = !/^https?:$/.test(location.protocol); // the desktop / phone apps can't come back from a Google redirect yet

/** Resolves once the captain is signed in (or chose to sail as a guest), showing the page when needed. */
export async function ensureSignedIn() {
  const back = await fromRedirect().catch(() => null);
  if (back?.session && !back.recovery) { setCaptain(captainName(back.session.user)); return showPage({ done: captainName(back.session.user) }); } // back from Google or an email link
  if (back?.recovery) return showPage({ mode: 'reset', session: back.session });
  if (!back?.error && (await currentSession() || isGuest())) return;
  return showPage({ err: back?.error });
}

function showPage({ mode = 'in', session = null, done = '', err = '' } = {}) {
  return new Promise(resolve => {
    const hour = new Date().getHours(), night = hour < 6 || hour >= 18, chart = savedChart();
    const root = document.createElement('div'); root.className = `si ${night ? 'night' : 'day'} lay-d`;
    root.innerHTML = `
      <div class="si-sky"><canvas aria-hidden="true"></canvas><div class="si-scrim"></div></div>
      <div class="si-page">
        <header class="si-head"><b>Sailo</b><span>Sail. Discover. Connect.</span></header>
        <main class="si-main">
          <form class="si-form" novalidate>
            <div class="si-tabs" role="tablist"><button type="button" data-tab="in">Sign in</button><button type="button" data-tab="up">Create account</button></div>
            <div class="si-title"><h1></h1><p></p></div>
            <div class="si-fields">
              <label class="si-field" data-f="name"><span class="si-label"><span>Captain name</span></span><input name="name" maxlength="18" spellcheck="false" autocomplete="nickname" placeholder="Captain Dhaval"></label>
              <label class="si-field" data-f="email"><span class="si-label"><span>Email</span></span><input name="email" type="email" autocomplete="email" spellcheck="false" placeholder="you@harbour.com"></label>
              <label class="si-field" data-f="pw"><span class="si-label"><span>Password</span><em></em></span><span class="si-pw"><input name="pw" type="password" autocomplete="current-password" placeholder="••••••••"><button type="button" class="si-show">Show</button></span></label>
              <div class="si-fuel"><span>FUEL</span><span class="bar"><i></i></span><span class="lbl">Empty tank</span></div>
            </div>
            <p class="si-err" role="alert" hidden></p><p class="si-note" role="status" hidden></p>
            <div class="si-actions"><button type="submit" class="si-cta"></button><a href="#" class="si-forgot">Forgot password?</a></div>
            <div class="si-or"><i></i><span>OR</span><i></i></div>
            <div class="si-social"><button type="button" data-p="google">Google</button><button type="button" data-p="apple">Apple</button></div>
            <button type="button" class="si-guest">Just looking? <span>Sail as a guest →</span></button>
          </form>
        </main>
        <footer class="si-foot"><small>© Sailo${chart?.name ? ' · ' + chart.name : ''}</small><span class="si-hint"></span></footer>
      </div>
      <div class="si-done" hidden><small>Welcome aboard</small><b></b><span></span><button type="button">Start sailing</button></div>
      <span class="si-loading">LIGHTING THE LAMP…</span>`;
    document.body.appendChild(root);
    const $ = s => root.querySelector(s), form = $('.si-form'), cv = $('canvas'), inp = n => form.elements[n];
    const st = { mode, showPw: false, focus: '', busy: false, sent: false, layout: 'd' };
    let api = null;

    // ---- the live scene ----
    const fit = () => { const r = cv.getBoundingClientRect(), lay = r.width < 640 ? 'm' : (r.width < 1024 || r.height > r.width * 1.1) ? 't' : 'd';
      if (lay !== st.layout) { st.layout = lay; root.classList.remove('lay-m', 'lay-t', 'lay-d'); root.classList.add('lay-' + lay); paint(); } api?.resize(r.width, r.height, lay); };
    const ro = new ResizeObserver(fit); ro.observe(cv);
    import('./signin-scene.js').then(m => m.createScene(cv, m.PRESETS[night ? 'night' : 'day'], { maxDpr: 1.5 }))
      .then(a => { api = a; fit(); syncLamp(); $('.si-loading').hidden = true; })
      .catch(e => { console.warn('Sailo sign-in scene failed', e); $('.si-loading').hidden = true; });
    cv.addEventListener('pointerdown', e => api?.tap(e.clientX, e.clientY));
    const spray = n => api?.splashBow(n);
    const syncLamp = () => api?.setLamp(!(st.focus === 'pw' && !st.showPw));

    // ---- state -> page ----
    const strength = pw => { let s = 0; if (pw.length >= 8) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++; if (pw.length >= 12) s++; return pw ? s : 0; };
    const LABELS = ['Empty tank', 'Running on fumes', 'Quarter tank', 'Half tank', 'Nearly full', 'Full tank'];
    function paint() {
      const up = st.mode === 'up', reset = st.mode === 'reset', m = st.layout === 'm';
      root.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === st.mode));
      $('.si-tabs').hidden = reset;
      $('h1').textContent = reset ? 'Set a new password.' : up ? 'Join the crew.' : 'Welcome back, Captain.';
      $('.si-title p').textContent = reset ? 'Choose a fresh one and you’re back aboard.' : up ? 'Claim a tug and turn any city on Earth into open ocean.' : night ? 'The lamp’s lit. Your tug is right where you moored it.' : 'Your tug is right where you moored it.';
      $('[data-f="name"]').hidden = !up; $('[data-f="email"]').hidden = reset;
      $('.si-fuel').hidden = !(up || reset);
      inp('pw').autocomplete = up || reset ? 'new-password' : 'current-password';
      inp('pw').type = st.showPw ? 'text' : 'password'; $('.si-show').textContent = st.showPw ? 'Hide' : 'Show';
      $('.si-label em').textContent = st.focus === 'pw' && !st.showPw ? 'Lamp off. No peeking.' : '';
      const s = strength(inp('pw').value), pct = inp('pw').value ? Math.max(8, s * 20) : 0, bar = $('.si-fuel i');
      bar.style.width = pct + '%'; bar.style.backgroundColor = pct < 35 ? '#FF6B5B' : pct < 70 ? '#FFC531' : '#34D1B6'; $('.si-fuel .lbl').textContent = LABELS[s];
      $('.si-cta').textContent = st.busy ? (st.busy === 'sail' ? 'Casting off…' : 'Checking the charts…') : reset ? 'Save password' : up ? 'Claim my tug' : 'Set sail';
      $('.si-cta').disabled = !!st.busy;
      $('.si-forgot').hidden = st.mode !== 'in'; $('.si-forgot').textContent = st.sent ? 'Message in a bottle sent ✓' : 'Forgot password?';
      $('.si-or').hidden = reset || m; $('.si-social').hidden = reset; $('.si-guest').hidden = reset;
      $('.si-hint').textContent = m ? 'Tap the water to steer' : 'Tap the water to steer · tap the tug to say hi';
    }
    const say = (el, text) => { const e = $(el); e.textContent = text || ''; e.hidden = !text; };
    const error = text => { say('.si-note', ''); say('.si-err', text); shake(); spray(14); };
    const note = text => { say('.si-err', ''); say('.si-note', text); };
    const shake = () => form.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(9px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'ease-out' });

    // ---- finishing: the tug sails off, then "Welcome aboard" ----
    const welcome = name => { $('.si-done b').textContent = name; $('.si-done span').textContent = `${chart?.name || 'Your ocean'} is ready when you are.`; $('.si-done').hidden = false; $('.si-main').style.visibility = 'hidden'; $('.si-done button').focus(); };
    const castOff = name => { st.busy = 'sail'; say('.si-err', ''); say('.si-note', ''); paint(); api?.sailOff(); setTimeout(() => welcome(name), 2200); };
    $('.si-done button').addEventListener('click', () => { ro.disconnect(); root.classList.add('gone'); setTimeout(() => { api?.dispose(); root.remove(); }, 650); resolve(); });
    if (done) { $('.si-loading').hidden = true; castOff(done); }

    // ---- input ----
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.tab; say('.si-err', ''); paint(); }));
    form.addEventListener('input', e => { if (e.target.name) { spray(3); if (e.target.name === 'pw') paint(); } });
    form.addEventListener('focusin', e => { st.focus = e.target.name === 'pw' ? 'pw' : 'x'; paint(); syncLamp(); });
    form.addEventListener('focusout', () => { st.focus = ''; paint(); syncLamp(); });
    $('.si-show').addEventListener('click', () => { st.showPw = !st.showPw; paint(); syncLamp(); });
    const validEmail = v => /^\S+@\S+\.\S+$/.test(v);
    $('.si-forgot').addEventListener('click', async e => { e.preventDefault(); const email = inp('email').value.trim();
      if (!validEmail(email)) return error('Add your email first and we’ll send a bottle.');
      try { await sendReset(email); st.sent = true; paint(); spray(10); note('Check your inbox: the bottle has a link to set a new password.'); } catch (x) { error(x.message); } });
    root.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { if (st.busy) return;
      if (b.dataset.p === 'apple') return error('Apple sign-in is coming soon. Use Google or email for now.');
      if (native) return error('Google sign-in works on the web for now. Use your email here.');
      st.busy = 'wait'; paint(); oauth('google'); }));
    $('.si-guest').addEventListener('click', () => { if (st.busy) return; sailAsGuest(); castOff('Guest Captain'); });
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (st.busy) return;
      const up = st.mode === 'up', reset = st.mode === 'reset', name = inp('name').value.trim(), email = inp('email').value.trim(), pw = inp('pw').value;
      const bad = up && !name ? 'Every captain needs a name.' : !reset && !validEmail(email) ? 'That email won’t float. Check it?' : (up || reset) && pw.length < 8 ? 'Fuel up: at least 8 characters.' : !pw ? 'Password, please.' : '';
      if (bad) return error(bad);
      st.busy = 'wait'; paint();
      try {
        if (reset) { await setPassword(session, pw); const n = captainName(session.user); setCaptain(n); castOff(n); return; }
        if (up) { const r = await signUp(email, pw, name);
          if (r.session) { setCaptain(name); castOff(name); return; }
          st.busy = false; st.mode = 'in'; inp('pw').value = ''; paint(); note(`Nearly there, ${name}: confirm your email from the link we sent, then sign in.`); spray(10); return; }
        const s = await signIn(email, pw), n = captainName(s.user); setCaptain(n); castOff(n);
      } catch (x) { st.busy = false; paint(); error(x.message); }
    });
    paint(); if (err) error(err);
  });
}
