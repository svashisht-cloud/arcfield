/* Fleet sims: three scenarios (yard, warehouse, city) in one console. Each scenario drives
   its map, telemetry panel and logs from one state. Scenarios sit in a horizontal
   scroll-snap track with tabs; only the visible one runs. Without JS (or with reduced
   motion) the still frames and snapshot values in the HTML are shown instead. */
(() => {
  const strip = document.querySelector('.scn-track');
  if (!strip) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Shared helpers ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const pad = (n, w = 4) => String(n).padStart(w, '0');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const DEG = 180 / Math.PI;
  // Highest speed (units/s) that can still stop within d units at deceleration a (units/s²).
  const stopSpeed = (d, a) => Math.sqrt(2 * a * Math.max(0, d));
  // Move v toward target, accelerating at most `up` and braking at most `down` (units/s²).
  const toward = (v, target, up, dt, down = up) => v + clamp(target - v, -down * dt, up * dt);
  const place = (el, x, y, ang = 0) =>
    el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(ang * DEG).toFixed(1)})`);
  const compass = ang => pad(Math.round((90 + ang * DEG + 720) % 360), 3); // 0 = up the screen
  const turnToward = (a, target, k) => a + Math.atan2(Math.sin(target - a), Math.cos(target - a)) * k;

  // Arc-length follower for an SVG path. at(s) → {x, y, a}; near(x, y) → {s, d} (closest sample).
  function track(pathEl, loop) {
    const len = pathEl.getTotalLength();
    const norm = s => loop ? ((s % len) + len) % len : clamp(s, 0, len);
    const at = s => {
      const p = pathEl.getPointAtLength(norm(s));
      const b = pathEl.getPointAtLength(loop ? norm(s - 1) : Math.max(0, s - 1));
      const f = pathEl.getPointAtLength(loop ? norm(s + 1) : Math.min(len, s + 1));
      return { x: p.x, y: p.y, a: Math.atan2(f.y - b.y, f.x - b.x) };
    };
    let samples;
    const near = (x, y) => {
      samples ||= Array.from({ length: Math.ceil(len / 2) + 1 }, (_, i) => {
        const p = pathEl.getPointAtLength(Math.min(i * 2, len));
        return { s: Math.min(i * 2, len), x: p.x, y: p.y };
      });
      let best = { s: 0, d: Infinity };
      for (const p of samples) { const d = Math.hypot(p.x - x, p.y - y); if (d < best.d) best = { s: p.s, d }; }
      return best;
    };
    // Distance ahead along a loop from s to target (0 … len).
    const ahead = (s, target) => ((target - s) % len + len) % len;
    return { len, at, near, ahead };
  }

  function logger(el) {
    el.textContent = '';
    return (svc, level, msg) => {
      const d = new Date();
      const ts = d.toTimeString().slice(0, 8) + '.' + pad(d.getMilliseconds(), 3);
      const line = document.createElement('div');
      line.className = 'l ' + level.toLowerCase();
      line.innerHTML = `<span class="ts">${ts}</span> <span class="svc">[${svc}]</span> <span class="lv">${level}</span> `;
      line.append(msg);
      el.append(line);
      while (el.children.length > 40) el.firstElementChild.remove();
    };
  }

  function fields(root) {
    const T = {};
    root.querySelectorAll('[data-t]').forEach(el => { T[el.dataset.t] = el; });
    return T;
  }
  const show = (el, on) => on ? el.removeAttribute('display') : el.setAttribute('display', 'none');
  const setTone = (el, tone) => { el.classList.toggle('ok', tone === 'ok'); el.classList.toggle('warn', tone === 'warn'); };

  // Rotating "heartbeat" log lines, one every 2.5-4 s of sim time.
  function heartbeats(lines) {
    let next = 3, i = 0;
    return clock => { if (clock > next) { next = clock + rnd(2.5, 4); lines[i++ % lines.length](); } };
  }

  /* ---------- 01 · Yard: AV-07 overtakes a stalled trailer, AV-03 yields ---------- */
  // Units: 1 SVG unit = 0.1 m, played back at 2x.
  function yard(root) {
    const svg = root.querySelector('svg'), $ = s => svg.querySelector(s);
    const route = track($('#yd-route'), false);
    const cab = $('#yd-cab'), trailer = $('#yd-trailer'), av3 = $('#yd-av03'), hold = $('#yd-hold');
    const l7 = $('#yd-l07'), l3 = $('#yd-l03');
    const log = logger(root.querySelector('.logs')), T = fields(root);

    const MPH = 8.94;                 // SVG units/s per mph at 0.1 m/unit and 2x playback
    const ACC = 4 * MPH, DEC = 3 * MPH;
    const TRAILER = 120;              // kingpin → rear axle
    const S_LANE = 590;               // AV-07 starts its move into lane 2 here (x = 330)
    const S_ASK = S_LANE - 140;       // …and asks fleet-mgr for lane 2 here
    const HOLD_X = 905, START3 = 1240, END3 = -200;   // AV-03 hold point (kingpin), entry and exit x
    const LANE2_Y = 235;

    const a7 = { s: 0, v: 0, rear: null, wait: 0, p: null };
    const a3 = { x: START3, v: 0, idle: true };
    let ev = {}, lane2 = 'free', mission = 412, battery = 78.4, motor = 52, clock = 0, bagAt = 0, lastPaint = -1;
    const beat = heartbeats([
      () => log('telemetry', 'DEBUG', `publish 20 Hz · 14 topics · link ${Math.round(rnd(30, 55))} ms`),
      () => log('logger', 'INFO', 'subscribers: dashboard, uploader (3/11 topics)'),
      () => log('fleet-mgr', 'DEBUG', `heartbeat AV-07 ok · AV-03 ${a3.idle ? 'idle' : 'ok'} · AV-11 charging`),
    ]);

    function startMission() {
      a7.s = 0; a7.v = 4 * MPH; a7.wait = 0; ev = {};
      const p = route.at(0);
      a7.rear = { x: p.x - TRAILER, y: p.y };
      log('fleet-mgr', 'INFO', `dispatch mission-${pad(mission)} → AV-07 (trailer T-${1180 + mission % 17} to door ${10 + mission % 9})`);
      log('config-check', 'INFO', 'pre-mission check: 42/42 params match baseline');
      log('planner', 'INFO', `route planned: ${(route.len / 10).toFixed(1)} m via aisle B`);
    }
    function finishMission() {
      log('uploader', 'INFO', `mission-${pad(mission)}.bag → s3://arcfield-sim/bags/ ✓`);
      log('fleet-mgr', 'INFO', `mission-${pad(mission)} complete`);
      mission++;
      a7.wait = 3.5;  // next dispatch after a short gap, so AV-03 has time to clear the aisle
    }
    // AV-03 is between its hold point and the end of the overtake stretch.
    const av3InStretch = () => !a3.idle && a3.x < HOLD_X + 5 && a3.x > 230;

    function stepAV07(dt) {
      if (a7.wait > 0) { a7.wait -= dt; if (a7.wait <= 0) startMission(); return; }
      const p0 = route.at(a7.s);

      // Ask for lane 2 before reaching the stalled trailer; denied while AV-03 is already in the stretch.
      if (a7.s > S_ASK && !ev.granted) {
        if (av3InStretch()) {
          if (!ev.denied) { ev.denied = 1; log('fleet-mgr', 'WARN', 'lane 2 occupied by AV-03 → AV-07 hold behind T-1203'); }
        } else {
          ev.granted = 1; lane2 = 'rsvd';
          log('fleet-mgr', 'INFO', 'lane 2 reserved for AV-07 (pass T-1203) · AV-03 hold at H-B2');
        }
      }

      let target = p0.x > 240 && !ev.clear ? 8 * MPH : 11 * MPH;
      if (!ev.granted) target = Math.min(target, stopSpeed(S_LANE - 30 - a7.s, DEC));
      a7.v = toward(a7.v, target, ACC, dt);
      a7.s += a7.v * dt;
      if (a7.s >= route.len) { finishMission(); return; }

      // Cab: fifth wheel on the route, pointing along the tangent.
      const p = a7.p = route.at(a7.s);
      place(cab, p.x, p.y, p.a);
      // Trailer: kingpin pinned to the fifth wheel; rear axle is dragged behind at a fixed distance.
      const dx = p.x - a7.rear.x, dy = p.y - a7.rear.y, len = Math.hypot(dx, dy) || 1;
      a7.rear = { x: p.x - dx / len * TRAILER, y: p.y - dy / len * TRAILER };
      place(trailer, p.x, p.y, Math.atan2(dy, dx));
      l7.setAttribute('x', (p.x + Math.cos(p.a) * 17).toFixed(1));
      l7.setAttribute('y', (p.y - 26).toFixed(1));
      l7.textContent = p.y < 280 ? 'AV-07 · PASS' : 'AV-07';

      // Events along the mission.
      const id = pad(mission);
      if (a7.s > 250 && !ev.obs) { ev.obs = 1; log('perception', 'WARN', `static obstacle in lane 1 @ ${rnd(46, 50).toFixed(0)} m: trailer T-1203 (stalled)`); }
      if (a7.s > S_ASK - 20 && !ev.ask) { ev.ask = 1; log('planner', 'INFO', 'lane 1 blocked → request lane 2 to pass T-1203'); }
      if (a7.s > 320 && !ev.loc) { ev.loc = 1; log('localization', 'INFO', `fix ok · conf ${rnd(99, 99.6).toFixed(1)}% · 14 landmarks`); }
      if (a7.s > S_LANE && !ev.lc) {
        ev.lc = 1; bagAt = clock;
        log('planner', 'INFO', 'lane change: lane 1 → lane 2 (overtake)');
        log('bag-recorder', 'INFO', 'event trigger lane_change → recording /lidar /planner (10 s window)');
      }
      if (ev.lc && !ev.bag && clock > bagAt + 5) {
        ev.bag = 1;
        log('bag-recorder', 'INFO', `saved mission-${id}_overtake.bag (${rnd(30, 45).toFixed(1)} MB, 4 topics)`);
      }
      if (p.x > 720 && !ev.back) { ev.back = 1; log('planner', 'INFO', 'T-1203 cleared → returning to lane 1'); }
      if (ev.back && !ev.clear && p.y > 290 && a7.rear.y > 290) {
        ev.clear = 1; lane2 = 'free';
        log('planner', 'INFO', 'back in lane 1 · lane 2 released');
        if (ev.held) log('planner@AV-03', 'INFO', 'lane 2 clear → resume');
      }
    }

    function stepAV03(dt) {
      if (a3.idle && !ev.disp && a7.wait <= 0 && a7.s > S_LANE) {
        ev.disp = 1; a3.idle = false; a3.x = START3; a3.v = 9 * MPH;
        log('fleet-mgr', 'INFO', 'dispatch AV-03 (bobtail) → door 4 via aisle B, lane 2');
      }
      if (a3.idle) return;
      let target = (ev.held ? 12 : 9) * MPH;
      if (lane2 === 'rsvd' && a3.x > HOLD_X - 2) target = Math.min(target, stopSpeed(a3.x - HOLD_X, DEC));
      a3.v = toward(a3.v, target, ACC, dt);
      a3.x -= a3.v * dt;
      if (lane2 === 'rsvd' && a3.v < 2 && !ev.held) { ev.held = 1; log('planner@AV-03', 'INFO', 'holding at H-B2 · oncoming AV-07 in lane 2'); }
      if (a3.x < END3) a3.idle = true;
      place(av3, a3.x, LANE2_Y, Math.PI);
      const holding = lane2 === 'rsvd' && a3.x > HOLD_X - 2 && a3.v < 4;
      l3.setAttribute('x', (a3.x - 17).toFixed(1));
      l3.textContent = holding ? 'AV-03 · HOLD' : 'AV-03';
      l3.classList.toggle('wait', holding);
    }

    function paint() {
      const p = a7.p || route.at(a7.s);
      T.spd.textContent = (a7.wait > 0 ? 0 : a7.v / MPH).toFixed(1);
      T.hdg.textContent = compass(p.a);
      T.pos.textContent = `${Math.max(0, p.x / 10).toFixed(0)},${((540 - p.y) / 10).toFixed(0)}`;
      T.bat.textContent = battery.toFixed(1);
      T.batbar.style.width = battery + '%';
      T.mot.textContent = Math.round(motor);
      T.zone.textContent = p.y > 270 ? 'B·L1' : 'B·L2';
      T.loc.textContent = rnd(99, 99.6).toFixed(1);
      T.lid.textContent = rnd(9.9, 10.1).toFixed(1);
      T.link.textContent = Math.round(rnd(32, 52));
      T.lane.textContent = lane2 === 'rsvd' ? 'RSVD' : 'FREE';
      setTone(T.lane, lane2 === 'rsvd' ? 'warn' : 'ok');
      T.mis.textContent = pad(mission);
      T.prog.textContent = Math.min(100, Math.round(a7.s / route.len * 100)) + '%';
    }

    place(av3, START3, LANE2_Y, Math.PI);
    l3.setAttribute('x', START3);
    startMission();
    return {
      step(dt) {
        clock += dt;
        stepAV07(dt);
        stepAV03(dt);
        hold.classList.toggle('on', lane2 === 'rsvd');
        battery = Math.max(20, battery - dt * 0.012 * (0.3 + a7.v / (11 * MPH)));
        motor += ((44 + a7.v / MPH * 1.4) - motor) * dt * 0.3;
        beat(clock);
        if (clock - lastPaint > 0.2 || dt === 0) { lastPaint = clock; paint(); }
      },
    };
  }

  /* ---------- 02 · Warehouse: AMRs on one-way loops, intersections reserved by a traffic manager ---------- */
  // Units: 1 SVG unit = 0.05 m, played back at 2x.
  function warehouse(root) {
    const svg = root.querySelector('svg'), $ = s => svg.querySelector(s);
    const log = logger(root.querySelector('.logs')), T = fields(root);

    const MS = 40;                    // SVG units/s per m/s at 0.05 m/unit and 2x playback
    const ACC = 1.2 * MS, DEC = 1 * MS;
    const REQ = 80;                   // request an intersection cell this far before it
    const WAIT = 42;                  // stop this far before a cell held by another robot
    const FREE = 34;                  // release a cell this far after crossing it
    const COLS = { 210: 'B', 330: 'C', 590: 'D', 720: 'E' }, ROWS = { 270: 2, 440: 3 };

    const CORNERS = {
      '#wh-r1': [[70, 270], [880, 270], [880, 440], [70, 440]],
      '#wh-r2': [[590, 100], [590, 490], [720, 490], [720, 100]],
      '#wh-r3': [[210, 100], [330, 100], [330, 490], [210, 490]],
    };
    const cells = [...svg.querySelectorAll('#wh-cells .cell')].map(el => {
      const x = +el.getAttribute('x') + 18, y = +el.getAttribute('y') + 18;
      return { x, y, el, name: COLS[x] + ROWS[y], owner: null };
    });

    function robot(id, loopSel, speed, start, stops = []) {
      const tr = track($(loopSel), true);
      const key = id.toLowerCase().replace('-', '');
      return {
        id, tr, el: $('#wh-' + key), lbl: $('#wh-l' + key.slice(3)), pod: $('#wh-' + key + ' .pod'),
        cruise: speed * MS, s: start, v: 0, ang: tr.at(start).a, dwell: 0, act: null,
        cells: cells.map(c => ({ c, ...tr.near(c.x, c.y) })).filter(c => c.d < 2),
        corners: CORNERS[loopSel].map(([x, y]) => tr.near(x, y).s),
        stops: stops.map(([x, y, t, act]) => ({ s: tr.near(x, y).s, t, act, armed: true })),
        waitingFor: null, waitT: 0,
      };
    }
    const amr05 = robot('AMR-05', '#wh-r1', 1.5, 0, [[460, 270, 1.6, 'lift'], [880, 270, 2.6, 'pick'], [460, 440, 1.6, 'store']]);
    const bots = [amr05, robot('AMR-12', '#wh-r2', 1.7, 520), robot('AMR-08', '#wh-r3', 1.3, 0)];

    let clock = 0, lastPaint = -1, battery = 64.2, podId = 3317, picks = 38, order = 58120, kg = 0;
    let task = 'FETCH', carrying = false;
    const beat = heartbeats([
      () => log('traffic-mgr', 'DEBUG', `cells reserved ${cells.filter(c => c.owner).length}/${cells.length} · robots 3/3 ok`),
      () => log('telemetry', 'DEBUG', `publish 10 Hz · 9 topics · link ${Math.round(rnd(8, 18))} ms`),
      () => log('fleet-mgr', 'DEBUG', 'heartbeat AMR-05 ok · AMR-12 ok · AMR-08 ok · AMR-17 charging'),
    ]);

    function action(b, act) {
      if (b !== amr05) return;
      if (act === 'lift') {
        carrying = true; kg = Math.round(rnd(140, 260)); task = 'DELIVER';
        log('task-mgr', 'INFO', `AMR-05 lifted P-${podId} @ rack C-${10 + podId % 9} (${kg} kg)`);
      } else if (act === 'pick') {
        picks++; task = 'RETURN';
        log('pick-station', 'INFO', `PICK-1 · ${Math.round(rnd(1, 5))} items from P-${podId} → order O-${order++}`);
      } else if (act === 'store') {
        carrying = false; kg = 0; task = 'FETCH';
        log('task-mgr', 'INFO', `P-${podId} stored @ rack D-${3 + podId % 7}`);
        podId += Math.round(rnd(3, 40));
        log('task-mgr', 'INFO', `assign AMR-05 → fetch P-${podId} for order O-${order}`);
      }
      show(b.pod, carrying);
    }

    function stepBot(b, dt) {
      if (b.dwell > 0) {
        b.dwell -= dt; b.v = 0;
        if (b.dwell <= 0) b.act = null;
        return;
      }
      let target = b.cruise;
      // Slow for corners (AMRs pivot there).
      for (const cs of b.corners) target = Math.min(target, stopSpeed(b.tr.ahead(b.s, cs), DEC) + 0.35 * MS);
      // Task stops: dwell on arrival, re-arm once well past.
      for (const st of b.stops) {
        const d = b.tr.ahead(b.s, st.s);
        if (!st.armed && d > 40 && d < b.tr.len - 40) st.armed = true;
        if (!st.armed) continue;
        if (d < 1.5 && b.v < 0.2 * MS) { st.armed = false; b.dwell = st.t; b.act = st.act; action(b, st.act); return; }
        target = Math.min(target, stopSpeed(d - 0.5, DEC));
      }
      // Intersection cells: reserve before entering, wait if another robot holds it, release after crossing.
      b.waitingFor = null;
      for (const rc of b.cells) {
        const c = rc.c, d = b.tr.ahead(b.s, rc.s), behind = b.tr.len - d;
        if (c.owner === b && behind > FREE && d > REQ) { c.owner = null; continue; }
        if (d >= REQ) continue;
        if (!c.owner) {
          c.owner = b;
          if (b.waitT > 0) log('traffic-mgr', 'INFO', `${c.name} → ${b.id} (waited ${b.waitT.toFixed(1)} s)`);
          b.waitT = 0;
        } else if (c.owner !== b) {
          target = Math.min(target, stopSpeed(d - WAIT, DEC));
          b.waitingFor = c;
        }
      }
      if (b.waitingFor) {
        if (b.waitT === 0 && b.v < 0.3 * MS) log('traffic-mgr', 'INFO', `${b.waitingFor.name} held by ${b.waitingFor.owner.id} → ${b.id} waiting`);
        if (b.v < 0.3 * MS || b.waitT > 0) b.waitT += dt;
      }
      b.v = toward(b.v, target, ACC, dt);
      b.s = (b.s + b.v * dt) % b.tr.len;
    }

    function draw(b, dt) {
      const p = b.tr.at(b.s);
      b.ang = dt ? turnToward(b.ang, p.a, Math.min(1, dt * 9)) : p.a;
      place(b.el, p.x, p.y, b.ang);
      const waiting = b.waitT > 0;
      b.el.classList.toggle('wait', waiting);
      b.lbl.setAttribute('x', p.x.toFixed(1));
      b.lbl.setAttribute('y', (p.y - 26).toFixed(1));
      b.lbl.textContent = b.id + (waiting ? ' · WAIT' : b.act ? ' · ' + b.act.toUpperCase() : '');
      b.lbl.classList.toggle('wait', waiting);
      b.p = p;
    }

    function paint() {
      const b = amr05, p = b.p;
      T.spd.textContent = (b.v / MS).toFixed(1);
      T.hdg.textContent = compass(b.ang);
      T.pos.textContent = `${(p.x * 0.05).toFixed(0)},${((540 - p.y) * 0.05).toFixed(0)}`;
      T.bat.textContent = battery.toFixed(1);
      T.batbar.style.width = battery + '%';
      T.task.textContent = task;
      T.pod.textContent = 'P-' + podId;
      T.kg.textContent = kg;
      const nav = b.waitT > 0 ? 'WAIT ' + b.waitingFor?.name : b.act ? b.act.toUpperCase() : b.v > 1 ? 'MOVING' : 'IDLE';
      T.nav.textContent = nav;
      setTone(T.nav, b.waitT > 0 ? 'warn' : '');
      T.cell.textContent = cells.find(c => c.owner === b)?.name || '—';
      T.picks.textContent = picks;
      T.loc.textContent = rnd(99.3, 99.8).toFixed(1);
      T.link.textContent = Math.round(rnd(8, 18));
    }

    show(amr05.pod, false);
    cells.forEach(c => c.el.classList.remove('on'));
    log('task-mgr', 'INFO', `assign AMR-05 → fetch P-${podId} for order O-${order}`);
    return {
      step(dt) {
        clock += dt;
        bots.forEach(b => stepBot(b, dt));
        bots.forEach(b => draw(b, dt));
        cells.forEach(c => c.el.classList.toggle('on', !!c.owner));
        battery = Math.max(20, battery - dt * 0.01 * (0.4 + amr05.v / amr05.cruise));
        beat(clock);
        if (clock - lastPaint > 0.2 || dt === 0) { lastPaint = clock; paint(); }
      },
    };
  }

  /* ---------- 03 · City: RT-21 pickup, signal, unprotected left with oncoming traffic and pedestrians ---------- */
  // Units: 1 SVG unit = 0.1 m, played back at 1x.
  function city(root) {
    const svg = root.querySelector('svg'), $ = s => svg.querySelector(s);
    const log = logger(root.querySelector('.logs')), T = fields(root);
    const NS = 'http://www.w3.org/2000/svg';

    const MPH = 4.47;                 // SVG units/s per mph at 0.1 m/unit and 1x playback
    const ACC = 5 * MPH, DEC = 3.5 * MPH;
    const BRAKE = 9 * MPH;            // hard-braking limit; plans use the gentler DEC
    const BOX = { x0: 516, x1: 604, y0: 256, y1: 344 };   // intersection box
    const CAR_GAP = 56;               // center-to-center gap kept to a stopped vehicle ahead
    const HEADWAY = 0.8;              // plus this many seconds of travel when moving
    const CONFLICT_X = 577;           // where RT-21's left turn crosses the westbound lane

    const route = track($('#ct-route'), false);
    const S_PICK = route.near(230, 320).s;
    const S_LINE = route.near(470, 320).s;              // front bumper at the eastbound stop line
    const S_WAIT = route.near(520, 320).s + 14;          // wait point inside the intersection
    const S_ARC_END = route.near(580, 260).s;

    // Signal cycle: [direction, color, seconds].
    const PHASES = [['ew', 'g', 12], ['ew', 'y', 3], ['all', 'r', 1.5], ['ns', 'g', 10], ['ns', 'y', 3], ['all', 'r', 1.5]];
    const CYCLE = PHASES.reduce((t, p) => t + p[2], 0);
    function signal(t) {
      let u = t % CYCLE;
      for (const [who, c, d] of PHASES) {
        if (u < d) return { ew: who === 'ew' ? c : 'r', ns: who === 'ns' ? c : 'r', left: d - u, phase: who + c };
        u -= d;
      }
    }

    // Lanes for background traffic. u = distance travelled from the spawn point.
    const LANES = {
      wb: { x: 1010, y: 280, dx: -1, dy: 0, line: 360, end: 1080, sig: 'ew' },
      sb: { x: 540, y: -50, dx: 0, dy: 1, line: 260, end: 660, sig: 'ns' },
      nb: { x: 580, y: 600, dx: 0, dy: -1, line: 210, end: 670, sig: 'ns' },
    };
    const npcLayer = $('#ct-npc'), pedLayer = $('#ct-peds'), rider = $('#ct-rider');
    const rtEl = $('#ct-rt21'), rtLbl = $('#ct-l21'), sigEls = [...svg.querySelectorAll('.sig')];
    npcLayer.textContent = ''; pedLayer.textContent = '';

    let clock = 22, lastPaint = -1, prevPhase = '', battery = 71.9, trip = 5521, riderId = 88, vehId = 30;
    const cars = [], peds = [], pedQueue = [];
    const nextSpawn = { wb: clock + 1, sb: clock + 2, nb: clock + 4 };
    const rt = { s: 0, v: 0, x: 0, y: 0, a: 0, dwell: 0, wait: 0, picked: false, committed: false, state: 'CRUISE', said: {} };
    const sig = () => signal(clock);
    const beat = heartbeats([
      () => log('perception', 'DEBUG', `tracked objects: ${trackedObjects()} · lidar 10 Hz · cams 6/6`),
      () => log('telemetry', 'DEBUG', `publish 20 Hz · 18 topics · link ${Math.round(rnd(28, 48))} ms`),
      () => log('fleet-mgr', 'DEBUG', 'heartbeat RT-21 ok · RT-09 ok · RT-14 charging'),
    ]);

    function spawnCar(lane) {
      const L = LANES[lane];
      const behind = Math.min(Infinity, ...cars.filter(c => c.lane === lane).map(c => c.u));
      if (behind < 90) return;
      const el = document.createElementNS(NS, 'use');
      el.setAttribute('href', '#car');
      npcLayer.append(el);
      cars.push({ id: 'veh-' + pad(++vehId, 3), lane, u: 0, v: Math.min(rnd(18, 24) * MPH, stopSpeed(behind - CAR_GAP, DEC)), cruise: rnd(20, 26) * MPH,
                  x: L.x, y: L.y, a: Math.atan2(L.dy, L.dx), el, held: false });
    }
    function spawnPed(cross) {
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('class', 'ped'); el.setAttribute('r', 5);
      pedLayer.append(el);
      const dir = Math.random() < 0.5 ? 1 : -1, speed = rnd(12, 16);
      const p = cross === 'n'
        ? { x: dir > 0 ? 495 : 625, y: 250, vx: dir * speed, vy: 0 }
        : { x: 510, y: dir > 0 ? 250 : 350, vx: 0, vy: dir * speed };
      peds.push({ cross, el, ...p });
    }

    // Distance to the nearest vehicle ahead in my path (ignores oncoming traffic).
    function gapAhead(me, x, y, a) {
      const cx = Math.cos(a), cy = Math.sin(a);
      let best = Infinity;
      for (const o of [rt, ...cars]) {
        if (o === me || (o === rt && rt.wait > 0)) continue;
        if (Math.cos(o.a - a) < -0.7) continue;
        const dx = o.x - x, dy = o.y - y, d = dx * cx + dy * cy;
        if (d <= 0 || d >= best) continue;
        if (Math.abs(-dx * cy + dy * cx) < 26) best = d;
      }
      return best;
    }
    // Must the vehicle stop for the light? Yellow: stop only if it comfortably can.
    const mustStop = (light, v, d) => d > -2 && (light === 'r' || (light === 'y' && v * v / (2 * DEC) < d));
    const trackedObjects = () => cars.filter(c => Math.hypot(c.x - rt.x, c.y - rt.y) < 450).length
      + peds.filter(p => Math.hypot(p.x - rt.x, p.y - rt.y) < 450).length;
    const oncoming = () => cars.find(c => c.lane === 'wb' && c.x > CONFLICT_X - 34 && !c.held
      && (c.x - CONFLICT_X) / Math.max(c.v, 8 * MPH) < 4.5);
    const pedNorth = () => peds.some(p => p.cross === 'n');
    const inBox = o => o.x > BOX.x0 && o.x < BOX.x1 && o.y > BOX.y0 && o.y < BOX.y1;
    // Another vehicle crossing my path is still in the intersection: don't enter, even on green.
    // (Oncoming westbound traffic keeps right of way over RT-21's left turn; RT-21 yields to it instead.)
    const boxBlocked = me => [rt, ...cars].some(o => o !== me && inBox(o) && (o === rt
      ? rt.wait <= 0 && me.lane !== 'wb' && Math.cos(rt.a - me.a) < 0.87
      : o.lane !== me.lane));
    // North/south traffic in the intersection or about to enter it (not held at a red light).
    const crossTraffic = () => cars.find(c => c.lane !== 'wb' && !c.held
      && (inBox(c) || (LANES[c.lane].line - c.u > -2 && (LANES[c.lane].line - c.u) / Math.max(c.v, 8 * MPH) < 3)));

    function say(key, svc, level, msg) { if (!rt.said[key]) { rt.said[key] = 1; log(svc, level, msg); } }

    function startTrip() {
      Object.assign(rt, { s: 0, v: 18 * MPH, dwell: 0, wait: 0, picked: false, committed: false, state: 'CRUISE', said: {} });
      riderId = 60 + Math.floor(rnd(0, 39));
      rider.setAttribute('cx', 230); rider.setAttribute('cy', 352); show(rider, true);
      log('dispatch', 'INFO', `trip T-${trip} → RT-21 · pickup rider R-${riderId} at Main St`);
    }

    function stepRT(dt, light) {
      if (rt.wait > 0) { rt.wait -= dt; if (rt.wait <= 0) startTrip(); return; }
      if (rt.dwell > 0) {
        rt.dwell -= dt; rt.v = 0; rt.state = 'PICKUP';
        const k = clamp((3 - rt.dwell) / 1.4, 0, 1);   // rider walks from the curb to the door
        rider.setAttribute('cy', (352 - 18 * k).toFixed(1));
        if (k >= 1) show(rider, false);
        if (rt.dwell <= 0) { rt.picked = true; log('rider-app', 'INFO', `R-${riderId} boarded · doors closed · seatbelt ok`); }
        return;
      }
      let target = 22 * MPH, state = 'CRUISE';
      if (!rt.picked) {
        const d = S_PICK - rt.s;
        target = Math.min(target, stopSpeed(d, DEC));
        if (d < 150) state = 'PICKUP';
        if (d < 1.5 && rt.v < 0.5 * MPH) {
          rt.dwell = 3;
          log('planner', 'INFO', `arrived at pickup · curbside stop, hazards on`);
          return;
        }
      } else {
        let sigStop = false;
        if (rt.s < S_LINE + 1 && mustStop(light.ew, rt.v, S_LINE - rt.s)) {
          sigStop = true;
          target = Math.min(target, stopSpeed(S_LINE - rt.s, DEC));
          if (S_LINE - rt.s < 120) {
            state = 'STOP·SIG';
            say('red', 'planner', 'INFO', `signal ${light.ew === 'r' ? 'RED' : 'YELLOW'} at Main & 3rd → stop at line`);
          }
        } else if (rt.said.red && !rt.said.green) say('green', 'planner', 'INFO', 'signal GREEN → proceed');
        if (rt.s > S_LINE - 160 && rt.s < S_ARC_END) target = Math.min(target, 10 * MPH);
        // Unprotected left: commit only with a gap in oncoming traffic and a clear crosswalk.
        if (!rt.committed && !sigStop && rt.s > S_LINE - 5) {
          const car = oncoming(), cross = crossTraffic(), ped = pedNorth();
          if (!car && !cross && !ped) {
            rt.committed = true;
            log('planner', 'INFO', 'unprotected left: gap ok, crosswalk clear → turning');
          } else {
            target = Math.min(target, stopSpeed(S_WAIT - rt.s, DEC));
            state = car ? 'YIELD·ONC' : cross ? 'YIELD·X' : 'YIELD·PED';
            if (car) say('onc:' + car.id, 'planner', 'INFO', `unprotected left onto 3rd Ave: yield to oncoming ${car.id}`);
            else if (cross) say('x:' + cross.id, 'planner', 'INFO', `yield to cross traffic ${cross.id}`);
            else say('ped', 'planner', 'WARN', 'pedestrian in north crosswalk → hold');
          }
        }
        if (rt.committed && rt.s < S_ARC_END) state = 'TURN';
      }
      target = Math.min(target, stopSpeed(gapAhead(rt, rt.x, rt.y, rt.a) - CAR_GAP - rt.v * HEADWAY, DEC));
      rt.v = toward(rt.v, target, ACC, dt, BRAKE);
      rt.s += rt.v * dt;
      rt.state = state;
      if (rt.s >= route.len) {
        log('dispatch', 'INFO', `trip T-${trip} · R-${riderId} dropped off at 3rd & Pine ✓`);
        log('uploader', 'INFO', `trip-${trip}.mcap → s3://arcfield-sim/trips/ ✓`);
        trip++; rt.wait = 2; rt.v = 0; return;
      }
    }

    function stepCars(dt, light) {
      for (const c of cars) {
        const L = LANES[c.lane], dLine = L.line - c.u;
        let target = c.cruise;
        c.boxWait = dLine > -2 && boxBlocked(c);
        if (mustStop(light[L.sig], c.v, dLine) || c.boxWait) target = Math.min(target, stopSpeed(dLine, DEC));
        target = Math.min(target, stopSpeed(gapAhead(c, c.x, c.y, c.a) - CAR_GAP - c.v * HEADWAY, DEC));
        c.v = toward(c.v, target, ACC, dt, BRAKE);
        c.u += c.v * dt;
        c.x = L.x + L.dx * c.u; c.y = L.y + L.dy * c.u;
        c.held = (light[L.sig] !== 'g' || c.boxWait) && dLine > -2 && dLine < 60 && c.v < 1;
        place(c.el, c.x, c.y, c.a);
      }
      for (let i = cars.length - 1; i >= 0; i--) {
        if (cars[i].u > LANES[cars[i].lane].end) { cars[i].el.remove(); cars.splice(i, 1); }
      }
    }

    function stepPeds(dt) {
      for (let i = pedQueue.length - 1; i >= 0; i--) {
        if (clock >= pedQueue[i].t) { spawnPed(pedQueue[i].cross); pedQueue.splice(i, 1); }
      }
      for (let i = peds.length - 1; i >= 0; i--) {
        const p = peds[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.el.setAttribute('cx', p.x.toFixed(1)); p.el.setAttribute('cy', p.y.toFixed(1));
        if (p.x < 490 || p.x > 630 || p.y < 245 || p.y > 355) { p.el.remove(); peds.splice(i, 1); }
      }
    }

    function paint(light) {
      T.spd.textContent = (rt.v / MPH).toFixed(1);
      T.hdg.textContent = compass(rt.a);
      T.pos.textContent = `${Math.max(0, rt.x / 10).toFixed(0)},${Math.max(0, (540 - rt.y) / 10).toFixed(0)}`;
      T.bat.textContent = battery.toFixed(1);
      T.batbar.style.width = battery + '%';
      T.trip.textContent = 'T-' + trip;
      const onboard = rt.picked && rt.wait <= 0;
      T.rider.textContent = rt.dwell > 0 ? 'BOARDING' : onboard ? 'ONBOARD' : 'WAITING';
      setTone(T.rider, onboard ? 'ok' : '');
      T.eta.textContent = (rt.wait > 0 ? 0 : (route.len - rt.s) / (20 * MPH) / 60 + 2.4).toFixed(1);
      T.sig.textContent = `${light.ew.toUpperCase()}·${Math.ceil(light.left)}s`;
      setTone(T.sig, light.ew === 'g' ? 'ok' : 'warn');
      T.obj.textContent = trackedObjects();
      T.plan.textContent = rt.wait > 0 ? 'DROPOFF' : rt.state;
      setTone(T.plan, /YIELD|STOP/.test(rt.state) ? 'warn' : '');
      T.loc.textContent = rnd(99.5, 99.9).toFixed(1);
      T.link.textContent = Math.round(rnd(28, 48));
    }

    startTrip();
    return {
      step(dt) {
        clock += dt;
        const light = sig();
        if (light.phase !== prevPhase) {
          // Pedestrians start crossing with the walk signal: north crosswalk with EW green, west with NS green.
          if (light.phase === 'ewg') for (let i = 0, n = 1 + (Math.random() < 0.5); i < n; i++) pedQueue.push({ t: clock + rnd(0, 2.5), cross: 'n' });
          if (light.phase === 'nsg' && Math.random() < 0.6) pedQueue.push({ t: clock + rnd(0, 2), cross: 'w' });
          prevPhase = light.phase;
        }
        for (const lane in nextSpawn) {
          if (clock > nextSpawn[lane]) { spawnCar(lane); nextSpawn[lane] = clock + (lane === 'wb' ? rnd(3, 7) : rnd(5, 10)); }
        }
        stepRT(dt, light);
        stepCars(dt, light);
        stepPeds(dt);

        const p = route.at(rt.s);
        rt.x = p.x; rt.y = p.y; rt.a = p.a;
        place(rtEl, p.x, p.y, p.a);
        const yielding = /YIELD|STOP/.test(rt.state) && rt.v < 3 * MPH;
        rtLbl.setAttribute('x', p.x.toFixed(1));
        rtLbl.setAttribute('y', (p.y + (p.y > 300 ? 40 : -24)).toFixed(1));
        rtLbl.textContent = yielding ? 'RT-21 · ' + (rt.state.startsWith('STOP') ? 'STOP' : 'YIELD') : 'RT-21';
        rtLbl.classList.toggle('wait', yielding);
        sigEls.forEach(el => el.setAttribute('class', 'sig ' + light[el.dataset.sig]));

        battery = Math.max(20, battery - dt * 0.006 * (0.3 + rt.v / (22 * MPH)));
        beat(clock);
        if (clock - lastPaint > 0.2 || dt === 0) { lastPaint = clock; paint(light); }
      },
    };
  }

  /* ---------- Carousel: tabs ↔ scroll-snap track (ARIA tabs pattern, roving tabindex) ---------- */
  const panels = [...strip.querySelectorAll(':scope > .scn')];
  const tabs = [...document.querySelectorAll('.scn-tabs .tab')];
  const ttl = document.getElementById('sim-ttl');
  let cur = 0;
  function select(i, { scroll, focus } = {}) {
    cur = i;
    tabs.forEach((t, j) => {
      const on = i === j;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      panels[j].setAttribute('aria-hidden', !on);
    });
    ttl.textContent = panels[i].dataset.ttl;
    if (scroll) strip.scrollTo({ left: i * strip.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    if (focus) tabs[i].focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i, { scroll: true }));
    t.addEventListener('keydown', e => {
      const n = tabs.length;
      const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
      const digit = /^[1-9]$/.test(e.key) && +e.key <= n ? +e.key - 1 : undefined;
      const next = k !== undefined ? (k + n) % n : digit;
      if (next === undefined) return;
      e.preventDefault();
      select(next, { scroll: true, focus: true });
    });
  });
  // Swipes and trackpad scrolls move the track; sync the tabs once it settles.
  let settle;
  strip.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const i = clamp(Math.round(strip.scrollLeft / strip.clientWidth), 0, panels.length - 1);
      if (i !== cur) select(i);
    }, 80);
  }, { passive: true });
  select(0);

  if (reduce) return;

  /* ---------- Runtime: one rAF loop, stepping only the scenarios that are on screen ---------- */
  const SCENES = { yard, warehouse, city };
  const scenes = panels.map(p => SCENES[p.dataset.scn](p));
  scenes.forEach(s => s.step(0));
  const running = new Set();
  let last = 0, raf = 0;
  function frame(t) {
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
    last = t;
    running.forEach(s => s.step(dt));
    raf = running.size ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const s = scenes[panels.indexOf(e.target)];
      if (e.isIntersecting && e.intersectionRatio >= 0.1) running.add(s); else running.delete(s);
    });
    if (running.size && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }, { threshold: [0, 0.1] });
  panels.forEach(p => io.observe(p));
})();
