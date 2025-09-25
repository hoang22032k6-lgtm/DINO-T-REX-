(function () {
  "use strict";

  /** DOM refs **/
  const gameEl = document.getElementById("game");
  const dinoEl = document.getElementById("dino");
  const groundEl = document.getElementById("ground");
  const scoreEl = document.getElementById("score");
  const hiEl = document.getElementById("hiscore");
  const overlayEl = document.getElementById("overlay");

  /** Game state **/
  let isRunning = false;
  let isGameOver = false;
  let isGrounded = true;
  let isDucking = false;
  let velocityY = 0;
  let dinoY = 0;
  const MAX_JUMPS = 2;
  let jumpCount = 0;
  let speed = 300; // px/s
  let obstacleSpeed = 300; // px/s, sync with speed
  let spawnTimer = 0;
  let spawnInterval = 1.3; // seconds
  let score = 0; // điểm theo số chướng ngại đã vượt
  let hiScore = Number(localStorage.getItem("dino_hi") || 0);
  let lastTime = 0;
  const obstacles = [];
  // Background state
  let cloudOffset = 0;
  let hill1Offset = 0, hill2Offset = 0, hill3Offset = 0;
  let dayNightTimer = 0;
  const bg = {
    sky: document.querySelector("#game .bg .sky"),
    sun: document.querySelector("#game .bg .sun"),
    clouds: document.querySelector("#game .bg .clouds"),
    birds: document.querySelector("#game .bg .birds"),
    hill1: document.querySelector("#game .hills .layer1"),
    hill2: document.querySelector("#game .hills .layer2"),
    hill3: document.querySelector("#game .hills .layer3"),
  };

  hiEl.textContent = `HI ${formatScore(hiScore)}`;

  // Apply image skin if provided via data-sprite
  (function applySprite() {
    const src = dinoEl.getAttribute("data-sprite");
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      dinoEl.classList.add("skin-image");
      dinoEl.style.backgroundImage = `url('${src}')`;
    };
    img.onerror = () => {
      // fallback: giữ dino mặc định và hiển thị gợi ý lỗi đường dẫn
      try {
        const titleEl = overlayEl.querySelector(".title");
        if (titleEl) {
          titleEl.textContent = "Không tải được ảnh nhân vật. Kiểm tra đường dẫn: " + src;
        }
        overlayEl.classList.remove("hidden");
      } catch (_) {}
    };
    img.src = src;
  })();

  /** Utilities **/
  function formatScore(value) {
    return String(Math.floor(value)).padStart(5, "0");
  }

  function setScore(value) {
    scoreEl.textContent = formatScore(value);
  }

  function rnd(min, max) { return Math.random() * (max - min) + min; }

  function resetGame() {
    // clear obstacles
    obstacles.forEach(o => o.el.remove());
    obstacles.length = 0;
    // reset state
    isRunning = true;
    isGameOver = false;
    isGrounded = true;
    isDucking = false;
    velocityY = 0;
    dinoY = 0;
    jumpCount = 0;
    speed = 300;
    obstacleSpeed = 300;
    spawnTimer = 0;
    spawnInterval = 1.2;
    score = 0;
    lastTime = performance.now();
    dinoEl.style.bottom = "4px";
    dinoEl.classList.add("run");
    dinoEl.classList.remove("duck");
    overlayEl.classList.add("hidden");
    requestAnimationFrame(loop);
  }

  /** Controls **/
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (!isRunning || isGameOver) { start(); return; }
      jump();
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      duck(true);
    } else if (e.code === "Enter") {
      if (isGameOver || !isRunning) start();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") {
      duck(false);
    }
  });

  // touch
  gameEl.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (!isRunning || isGameOver) { start(); return; }
    jump();
  }, { passive: false });

  function start() {
    if (isRunning) return;
    resetGame();
  }

  function jump() {
    if (!isRunning || isGameOver) return;
    if (jumpCount >= MAX_JUMPS) return;
    // first jump can be slightly stronger than second
    const impulse = jumpCount === 0 ? 600 : 520;
    isGrounded = false;
    velocityY = impulse;
    jumpCount += 1;
    dinoEl.classList.remove("run");
  }

  function duck(on) {
    if (!isRunning || isGameOver) return;
    isDucking = on;
    if (on) {
      dinoEl.classList.add("duck");
    } else {
      dinoEl.classList.remove("duck");
    }
  }

  /** Obstacles **/
  function spawnObstacle() {
    const el = document.createElement("div");
    el.className = "obstacle";
    const variant = Math.random();
    // 20% cơ hội sinh ra Codai.png như một chướng ngại đặc biệt
    if (Math.random() < 0.2) {
      el.classList.add("sprite", "codai");
    } else {
      if (variant > 0.7) el.classList.add("tall");
      if (variant < 0.25) el.classList.add("wide");
    }
    el.style.right = "-40px";
    gameEl.appendChild(el);

    const rect = el.getBoundingClientRect();
    const obj = { el, x: -rect.width, width: rect.width, height: rect.height, passed: false };
    obstacles.push(obj);
  }

  // Decorative birds (no collision)
  const birds = [];
  let birdSpawnTimer = 0;
  function spawnBird() {
    if (!bg.birds) return;
    const el = document.createElement("div");
    el.className = "bird";
    // random height in sky
    const top = 10 + Math.random() * 60; // px from top inside game
    el.style.top = `${top}px`;
    el.style.right = `-60px`;
    bg.birds.appendChild(el);
    const rect = el.getBoundingClientRect();
    birds.push({ el, x: -rect.width });
  }

  function updateObstacles(dt, gameWidth) {
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x += obstacleSpeed * dt; // moving left visually by increasing right
      o.el.style.right = `${o.x}px`;
      // remove when out of screen
      if (o.x > gameWidth + 80) {
        o.el.remove();
        obstacles.splice(i, 1);
      }
    }
  }

  function updateScoreOnPassed() {
    const gameRect = gameEl.getBoundingClientRect();
    const dinoRect = dinoEl.getBoundingClientRect();
    const dinoX = dinoRect.left - gameRect.left;
    for (let i = 0; i < obstacles.length; i++) {
      const obRect = obstacles[i].el.getBoundingClientRect();
      const obX = obRect.left - gameRect.left + obRect.width; // mép phải của vật cản
      if (!obstacles[i].passed && obX < dinoX) {
        obstacles[i].passed = true;
        score += 1;
        setScore(score);
      }
    }
  }

  /** Physics and loop **/
  function loop(timestamp) {
    if (!isRunning) return;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.033);
    lastTime = timestamp;

    // speed up over time
    speed += 6 * dt;
    obstacleSpeed = speed;

    // parallax ground
    const groundOffset = (parseFloat(groundEl.dataset.offset || "0") + speed * dt) % 32;
    groundEl.dataset.offset = String(groundOffset);
    groundEl.style.backgroundPositionX = `-${groundOffset}px`;

    // parallax background
    cloudOffset = (cloudOffset + speed * 0.25 * dt) % 5000;
    hill1Offset = (hill1Offset + speed * 0.3 * dt) % 1000;
    hill2Offset = (hill2Offset + speed * 0.2 * dt) % 1000;
    hill3Offset = (hill3Offset + speed * 0.1 * dt) % 1000;
    if (bg.clouds) bg.clouds.style.transform = `translateX(${-cloudOffset}px)`;
    if (bg.hill1) bg.hill1.style.backgroundPositionX = `-${hill1Offset}px`;
    if (bg.hill2) bg.hill2.style.backgroundPositionX = `-${hill2Offset}px`;
    if (bg.hill3) bg.hill3.style.backgroundPositionX = `-${hill3Offset}px`;

    // birds spawn and move (20% chance when timer hits)
    birdSpawnTimer += dt;
    if (birdSpawnTimer > 2.5) {
      birdSpawnTimer = 0;
      if (Math.random() < 0.2) spawnBird();
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      b.x += speed * 0.35 * dt;
      b.el.style.right = `${b.x}px`;
      if (b.x > gameEl.clientWidth + 100) {
        b.el.remove();
        birds.splice(i, 1);
      }
    }

    // day-night cycle
    dayNightTimer += dt;
    if (dayNightTimer >= 12) { // toggle every ~12s
      dayNightTimer = 0;
      gameEl.classList.toggle("night");
    }

    // gravity
    const gravity = 1600; // px/s²
    if (!isGrounded) {
      velocityY -= gravity * dt;
      dinoY += velocityY * dt;
      if (dinoY <= 0) {
        dinoY = 0;
        isGrounded = true;
        velocityY = 0;
        jumpCount = 0;
        dinoEl.classList.add("run");
      }
    }
    dinoEl.style.bottom = `${4 + dinoY}px`;

    // spawn obstacles
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
      spawnObstacle();
      spawnTimer = 0;
      spawnInterval = Math.max(0.7, spawnInterval - 0.02); // ramp difficulty
    }

    // update obstacles
    const gameWidth = gameEl.clientWidth;
    updateObstacles(dt, gameWidth);

    // scoring: tăng điểm khi chướng ngại đi qua bên trái nhân vật
    updateScoreOnPassed();

    // collision detection
    if (checkCollision()) {
      gameOver();
      return;
    }

    requestAnimationFrame(loop);
  }

  function getDinoHitbox() {
    const dinoRect = dinoEl.getBoundingClientRect();
    const gameRect = gameEl.getBoundingClientRect();
    const raw = {
      x: dinoRect.left - gameRect.left,
      y: gameRect.bottom - dinoRect.bottom,
      width: dinoRect.width,
      height: dinoRect.height,
    };
    // Thu nhỏ hitbox của dino cho công bằng (tránh va sớm vào pixel trống)
    const shrinkX = raw.width * 0.15; // 15% mỗi bên
    const shrinkY = raw.height * 0.1; // 10% phía trên
    return {
      x: raw.x + shrinkX,
      y: raw.y + shrinkY,
      width: raw.width - shrinkX * 2,
      height: raw.height - shrinkY * 1.5,
    };
  }

  function getObstacleHitbox(obEl) {
    const r = obEl.getBoundingClientRect();
    const gameRect = gameEl.getBoundingClientRect();
    const raw = {
      x: r.left - gameRect.left,
      y: gameRect.bottom - r.bottom,
      width: r.width,
      height: r.height,
    };
    // Nếu là Codai (ảnh lớn), dùng hitbox gần như đầy đủ
    if (obEl.classList.contains("codai")) {
      // Hitbox bằng nửa ảnh (lấy nửa bên trái), chiều cao giữ nguyên
      return {
        x: raw.x,
        y: raw.y,
        width: raw.width * 0.5,
        height: raw.height,
      };
    }
    // Mặc định (cactus): thu nhỏ nhẹ để đỡ khó
    const shrinkX = raw.width * 0.1;
    const shrinkY = raw.height * 0.1;
    return {
      x: raw.x + shrinkX,
      y: raw.y + shrinkY,
      width: raw.width - shrinkX * 2,
      height: raw.height - shrinkY * 1.2,
    };
  }

  function checkCollision() {
    const d = getDinoHitbox();
    for (let i = 0; i < obstacles.length; i++) {
      const el = obstacles[i].el;
      const o = getObstacleHitbox(el);
      if (rectsIntersect(d, o)) return true;
    }
    return false;
  }

  function rectsIntersect(a, b) {
    return !(
      a.x + a.width < b.x ||
      a.x > b.x + b.width ||
      a.y + a.height < b.y ||
      a.y > b.y + b.height
    );
  }

  function gameOver() {
    isGameOver = true;
    isRunning = false;
    dinoEl.classList.remove("run");
    overlayEl.classList.remove("hidden");
    overlayEl.querySelector(".title").textContent = "Thua rồi! Nhấn Enter để chơi lại";
    // hi score
    if (score > hiScore) {
      hiScore = Math.floor(score);
      localStorage.setItem("dino_hi", String(hiScore));
      hiEl.textContent = `HI ${formatScore(hiScore)}`;
    }
  }

  // initial state: show overlay and wait for start
  overlayEl.classList.remove("hidden");
})();


