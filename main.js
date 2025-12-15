// main.js - Timing interception prototype (PC)
// ES6 classes, vector helpers, enemies falling from top, player fires from bottom center

// ---- Utils: simple 2D vector helpers ----
class Vec {
  constructor(x=0,y=0){this.x=x;this.y=y}
  copy(){return new Vec(this.x,this.y)}
  add(v){this.x+=v.x;this.y+=v.y;return this}
  sub(v){this.x-=v.x;this.y-=v.y;return this}
  mul(s){this.x*=s;this.y*=s;return this}
  len(){return Math.hypot(this.x,this.y)}
  normalize(){let l=this.len()||1;this.x/=l;this.y/=l;return this}
  static dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
}

// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let DPR = Math.max(1, window.devicePixelRatio || 1);
const GAME_W = 600; // internal resolution (fixed for consistent gameplay)
const GAME_H = 800;

function resizeCanvas() {
  // Scale canvas to fit window while keeping aspect ratio
  const scale = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H, 1);
  canvas.style.width = Math.round(GAME_W * scale) + 'px';
  canvas.style.height = Math.round(GAME_H * scale) + 'px';

  // Keep drawing buffer at crisp DPR for internal fixed resolution
  canvas.width = Math.round(GAME_W * DPR);
  canvas.height = Math.round(GAME_H * DPR);
  canvas.style.imageRendering = 'pixelated';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

canvas.style.touchAction = "none";

const images = {
    bgImg: 'bg.png',
    tomatoImg: 'tomato.png',
    cauliImg: 'cauli.png',
    cabbageImg: 'cabbage.png',
    pumpkinImg: 'pumpkin.png',
    turnipImg: 'turnip.png',
    introImg: 'vegintro.png',
    bombardImg: 'bombard.png',
    prismPetalImg: 'prism.png',
    blackHoleImg: 'blackhole.png',
    goldImg: 'golden.png',
    gameOverBg: 'gameover.png',
    transparencyImg: 'glass.png',
}

const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
};

async function loadAllImages(imageSources) {
    const loadedImages = {};
    for (const [key, src] of Object.entries(imageSources)) {
        try {
            loadedImages[key] = await loadImage(src);
            console.log(`${key} loaded successfully`);
        } catch (error) {
            console.error(error);
        }
    }
    return loadedImages;
}

// CLASSES
class Enemy {
  constructor(x, y, r=12, speed=80){
    this.pos = new Vec(x,y);
    this.r = r;
    this.speed = speed; // pixels per second
    this.maxSpeed = 150;
    this.dead = false;
    
    this.imgs = [loadedImages.cauliImg,loadedImages.cabbageImg,
      loadedImages.pumpkinImg, loadedImages.turnipImg];
      
    this.type = Math.floor(Math.random() * this.imgs.length);
    this.image = this.imgs[this.type];

    // Assign score per type
    this.score = [15, 30, 45, 60][this.type];

    this.killedByExplosion = false;
  }

  update(dt){
    this.pos.y += this.speed * dt;

    if(this.pos.y - this.r > GAME_H && !this.dead) {
      this.dead = true;
      this.killedByExplosion = false;
      lives -= 1;
    }

    if (this.speed > this.maxSpeed) {
        this.speed = this.maxSpeed;
    }

  }

  draw(ctx) {
    ctx.save();
    ctx.drawImage(
      this.image,
      this.pos.x - this.r,
      this.pos.y - this.r,
      this.r * 2,
      this.r * 2
    );
    ctx.restore();
  }
}

class Projectile {
  constructor(from, target, speed=500, width, height, image){
    this.pos = from.copy();
    this.target = target.copy();
    this.speed = speed;
    this.dir = new Vec(target.x - from.x, target.y - from.y).normalize();
    this.arrived = false;
    this.radius = 4;
    this.width = width;
    this.height = height;
    this.image = image;
  }
  update(dt){
    // Move straight towards target. If we pass it or get close enough, mark arrived
    this.pos.x += this.dir.x * this.speed * dt;
    this.pos.y += this.dir.y * this.speed * dt;
    if(Vec.dist(this.pos, this.target) < 6) this.arrived = true;
  }

  draw(ctx) {
      ctx.save();
      ctx.drawImage(
        this.image,
        this.pos.x - this.width / 2,
        this.pos.y - this.height / 2
      );
      ctx.restore();
  
  }
}

class Particle {
  constructor(pos, options = {}) {
    this.pos = pos.copy();
    const angle = Math.random() * Math.PI * 2;
    const speed = options.speedMin + Math.random() * (options.speedMax - options.speedMin);
    this.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    
    this.radius = options.radiusMin + Math.random() * (options.radiusMax - options.radiusMin);
    this.color = options.color || "yellow";
    this.life = options.life || 0.5;
    this.age = 0;
    this.gravity = options.gravity || 0; // optional downward acceleration
  }

  update(dt) {
    this.vel.y += this.gravity * dt; // apply gravity
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.age += dt;
  }

  draw(ctx) {
    const alpha = 1 - this.age / this.life;
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,0,${alpha})`;
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  get dead() {
    return this.age >= this.life;
  }
}

class Explosion {
  constructor(pos, options = {}) {
    this.pos = pos.copy();

    // Shockwave circle
    this.maxRadius = options.maxRadius || 50;
    this.duration = options.duration || 0.35;
    this.t = 0;

    // Particles
    this.particles = [];
    const numParticles = options.numParticles || 20;
    for (let i = 0; i < numParticles; i++) {
      this.particles.push(new Particle(pos, {
        radiusMin: options.radiusMin || 2,
        radiusMax: options.radiusMax || 6,
        speedMin: options.speedMin || 50,
        speedMax: options.speedMax || 200,
        life: options.particleLife || 0.5,
        color: "yellow",
        gravity: options.gravity || 0
      }));
    }

    this.dead = false;
    this._applied = false; // for damage
  }

  update(dt, enemies = []) {
    this.t += dt;

    // Apply damage once
    if (!this._applied) {

      // --- enemies ---
      for (let e of enemies) {
        if (!e.dead && Vec.dist(e.pos, this.pos) <= this.maxRadius + e.r) {
          e.dead = true;
          e.killedByExplosion = true;
        }
      }

      // --- collectibles ---
      for (let i = collectibles.length - 1; i >= 0; i--) {
        const c = collectibles[i];
        const cRadius = Math.max(c.width, c.height) / 2;
        const cPos = new Vec(c.x + c.width / 2, c.y + c.height / 2);

        if (Vec.dist(this.pos, cPos) <= this.maxRadius + cRadius) {

          if (c.type === "gold") {
            floatingTexts.push(
              new FloatingText("250", cPos.x, cPos.y, "gold", "black")
            );
            c.applyEffect();          // apply slow/remove effect
            collectibles.splice(i, 1); 
            console.log("Gold collected! Score =", score);

          } else {
            floatingTexts.push(
              new FloatingText(c.type.toUpperCase(), cPos.x, cPos.y, "gold", "black")
            );

            c.applyEffect();          // apply slow/remove effect
            collectibles.splice(i, 1); // remove collectible
          }
        }
      }

      this._applied = true;
    }

    // Update particles
    for (let p of this.particles) {
      p.update(dt);
    }

    // Mark dead when all particles are dead AND shockwave finished
    const particlesDead = this.particles.every(p => p.dead);
    const shockwaveDone = this.t >= this.duration;
    this.dead = particlesDead && shockwaveDone;
  }

  draw(ctx) {
    // Draw shockwave circle
    const p = Math.min(1, this.t / this.duration);
    const r = this.maxRadius * p;
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,0,0,${1 - p})`;
    ctx.arc(this.pos.x, this.pos.y, r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Draw particles
    for (let particle of this.particles) {
      particle.draw(ctx);
    }
  }
}

class Player {
  constructor(image){
    this.pos = new Vec(GAME_W/2, GAME_H - 40);
    this.baseRadius = 18;
    this.cooldown = 0.25;
    this.cooldownTimer = 0;
    this.image = image;
    this.width = 71;
    this.height = 100;
    this.angle = -Math.PI/2;
  }

  canShoot() {
    return this.cooldownTimer <= 0;
  }

  lookAt(target) {
    const dir = new Vec(target.x - this.pos.x, target.y - this.pos.y);
    this.angle = Math.atan2(dir.y, dir.x);
  }

  draw(ctx){
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y); // move origin to player center
    ctx.rotate(this.angle);                // rotate canvas
    ctx.drawImage(
      this.image,
      -this.width/2,                       // offset by half width/height
      -this.height/2,
      this.width,
      this.height
    );
    ctx.restore();
  }

  shoot(target) {
    this.cooldownTimer = this.cooldown;  // reset cooldown
    this.lookAt(target);                  // rotate toward target
    const from = new Vec(this.pos.x, this.pos.y - 20);
    return new Projectile(from, target, 600, 31,33, loadedImages.tomatoImg);
  }
}

class Collectible {
    constructor(type, x, y, movementMode = "sine") {
        this.type = type;
        this.movementMode = movementMode; // "sine" or "straight"

        this.width = 30;
        this.height = 30;

        this.x = x;
        this.y = y;

        // Sine wave parameters
        this.baseX = x;
        this.angle = 0;
        this.waveSpeed = 0.05;
        this.waveAmplitude = 40;

        this.speedY = 2;

        switch(this.type) {
            case "slow":
                this.image = loadedImages.prismPetalImg;
                break;
            case "remove":
                this.image = loadedImages.blackHoleImg;
                break;
            case "gold":
                this.image = loadedImages.goldImg;
                this.movementMode = "straight";
                break;
        }

        this.width = this.image.width;
        this.height = this.image.height;
    }

    update() {
        this.y += this.speedY;

        if (this.movementMode === "sine") {
            this.angle += this.waveSpeed;
            this.x = this.baseX + Math.sin(this.angle) * this.waveAmplitude;
        }
    }

    draw(ctx) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }

    applyEffect() {
        switch(this.type) {
            case "slow":
                enemySpeedMultiplier *= 0.9;
                for (let e of [...baseEnemies, ...extraEnemies]) {
                    e.speed *= 0.9;
                }
                break;

            case "remove":
                const aliveExtra = extraEnemies.filter(e => !e.dead);
                if (aliveExtra.length === 0) return;

                const count = Math.min(aliveExtra.length, 1 + Math.floor(Math.random() * 3));
                for (let i = 0; i < count; i++) {
                    const index = Math.floor(Math.random() * aliveExtra.length);
                    const enemy = aliveExtra[index];
                    extraEnemies.splice(extraEnemies.indexOf(enemy), 1);
                    aliveExtra.splice(index, 1);
                    maxExtraEnemies -= 1;
                }
                break;
            case "gold":
                score += 250;
                console.log(`Gold collected! Score is now: ${score}`);
                break;
        }
    }
}

class FloatingText {
    constructor(text, x, y, color = "white", stroke = "white") {
        this.text = text;
        this.x = x;
        this.y = y;
        this.color = color;
        this.stroke = stroke;
        this.opacity = 1;
        this.life = 150; 
        this.done = false;
    }

    update() {
        this.y -= 0.5;   
        this.opacity -= 0.002;  
        this.life--;

        if (this.life <= 0) {
            this.done = true;
            this.opacity = 0;
        }  
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.stroke;
        ctx.font = "50px pixelPurl";
        ctx.textAlign = "center";
        ctx.lineWidth = 1.5;
        ctx.fillText(this.text, this.x, this.y);
        ctx.strokeText(this.text, this.x, this.y)
        ctx.restore();
    }
}


// Game state
let player;
const enemies = [];
const projectiles = [];
const explosions = [];
let collectibles = [];
let nextCollectibleTime = 0;

let gameState = "introScreen";
let loadedImages;
let spawnTimer = 0;
const spawnInterval = 1.1;
let firstSpawn = true;

// DIFFICULTY CONTROLS
let difficultyTimer = 0;
let difficultyInterval = 10;
let enemyBaseSpeed = 100;
let enemySpeedIncrease = 10;
let enemySpeedMultiplier = 1;
const baseEnemies = [];
const extraEnemies = [];
//const allEnemies = [...baseEnemies, ...extraEnemies];
let score = 0;
let lives = 3;
let floatingTexts = [];

let maxExtraEnemies = 0;
let lastTime = performance.now();
let nextGoldTime = 0;

function gameLoop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    switch (gameState) {

        case "introScreen":
            introScreen();   // no dt needed unless animating intro
            break;

        case "gameScreen":
            gameScreen(dt);  // main game uses dt
            break;

        case "gameOverScreen":
            gameOverScreen();  // optional dt if animated
            break;
    }

    requestAnimationFrame(gameLoop);
}

//FUNCTIONS
// Spawning enemies
function spawnBaseEnemy() {
    const x = 20 + Math.random() * (GAME_W - 40);
    const y = -20;
    const r = 15;
    const speed = (80 + Math.random() * 40) * enemySpeedMultiplier; // apply multiplier
    baseEnemies.push(new Enemy(x, y, r, speed));
}

function spawnExtraEnemy() {
    if (extraEnemies.length >= maxExtraEnemies) return;
    const x = 20 + Math.random() * (GAME_W - 40);
    const y = -20;
    const r = 15;
    const speed = enemyBaseSpeed * (0.8 + Math.random() * 0.4) * enemySpeedMultiplier;
    extraEnemies.push(new Enemy(x, y, r, speed));
}

function gameStats() {
    // SCORE
    ctx.font = "50px PixelPurl";
    ctx.textAlign = "left";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.fillStyle = "black";
    ctx.strokeText(`SCORE : ${score}`, 50, 50);
    ctx.fillText(`SCORE : ${score}`, 50, 50);
    //LIVES
    ctx.font = "50px PixelPurl";
    ctx.textAlign = "right";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.fillStyle = "black";
    ctx.strokeText(`LIVES : ${lives}`, GAME_W - 50, 50);
    ctx.fillText(`LIVES : ${lives}`, GAME_W - 50, 50);
}

function resetGame() {
  baseEnemies.length = 0;
  extraEnemies.length = 0;
  lives = 3;
  score = 0;
  difficultyTimer = 0;
  enemies.length = 0;
  enemyBaseSpeed = 100;
  maxExtraEnemies = 0;
  collectibles.length = 0;
  player.angle = -Math.PI/2;
  floatingTexts.length = 0;
  projectiles.length = 0;
  scheduleNextCollectible();
}

function scheduleNextCollectible() {
    if (firstSpawn) {
        // First collectible spawns after 20 seconds
        nextCollectibleTime = performance.now() + 20000;
        firstSpawn = false;
    } else {
        // All later collectibles: 10 sec + random 1–20 sec
        nextCollectibleTime = performance.now() + 10000 + (Math.random() * 10000);
    }
}

function updateCollectibleSpawner() {
    const now = performance.now();

    if (now >= nextCollectibleTime) {

        // Randomly choose type
        const type = Math.random() < 0.5 ? "slow" : "remove";

        // Random x along the screen
        const x = 100 + Math.random() * GAME_W * 0.66;
        const y = -50;  // start above screen

        collectibles.push(new Collectible(type, x, y));

        scheduleNextCollectible();
    }
}

function scheduleNextGold() {
    const base = 30000; // 30 seconds
    const randomBonus = Math.random() * 30000; // 1–30 seconds
    nextGoldTime = performance.now() + base + randomBonus;
}

function updateGoldSpawner() {
    const now = performance.now();

    if (now >= nextGoldTime) {

        // Spawn gold
        const x = 100 + Math.random() * GAME_W * 0.66;
        const y = -50;

        collectibles.push(new Collectible("gold", x, y, "straight"));

        scheduleNextGold(); // schedule the next gold spawn
    }
}

//Helper function for user inputs
function handlePointerInput(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / DPR / rect.width;
  const scaleY = canvas.height / DPR / rect.height;

  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  // --- UI BUTTONS FIRST ---
  for (let btn of uiButtons) {
    if (btn.screen === gameState && btn.contains(x, y)) {
      btn.onClick();
      return; // 🔑 consume input
    }
  }

  // --- GAMEPLAY INPUT ---
  if (gameState !== "gameScreen") return;

  if (!player.canShoot()) return;

  projectiles.push(player.shoot(new Vec(x, y)));
}

function UIButton(x, y, width, height, color, text, textSize, image, onClick, screen) {
  this.x = x;
  this.y = y;
  this.width = width;
  this.height = height;
  this.color = color;
  this.text = text;
  this.textSize = textSize;
  this.image = image;
  this.onClick = onClick;
  this.screen = screen;

  this.draw = function() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${this.textSize}px pixelPurl`;
    ctx.fillText(this.text, this.x + this.width / 2, this.y + this.height / 2);

    ctx.strokeStyle = "white";
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    if (this.image) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
  };
    this.contains = function(px, py) {
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    );
  };
}

function createUIButtons() {
  uiButtons = [
    new UIButton(
      GAME_W / 2 - 125, 650, 250, 75, "green",
      "PLAY", 50, loadedImages.transparencyImg,
      () => { 
              gameState = "gameScreen"; 
              resetGame(); 
            },
      "introScreen"
    ),

    new UIButton(
      GAME_W / 2 - 125, 350, 250, 75, "green",
      "PLAY AGAIN?", 30, loadedImages.transparencyImg,
      () => { 
              console.log("PLAY AGAIN clicked");
              resetGame();
              gameState = "introScreen"; 
            },
      "gameOverScreen"
    ),
  ];
}

let uiButtons = [];
// Main game screen
function gameScreen(dt) {
    // SPAWN LOGIC
    spawnTimer += dt;
    while (spawnTimer >= spawnInterval) {
        spawnTimer -= spawnInterval;
        if (baseEnemies.length < 5) spawnBaseEnemy();
    }

    // Spawn extra enemies gradually
    spawnExtraEnemy();
    updateCollectibleSpawner();
    updateGoldSpawner();   

    // DIFFICULTY SCALING
    difficultyTimer += dt;
    if (difficultyTimer >= difficultyInterval) {
        difficultyTimer = 0;
        maxExtraEnemies += 1;          // allow more extra enemies
        enemyBaseSpeed += enemySpeedIncrease; // faster new enemies
        enemySpeedMultiplier += 0.04;
        console.log("Difficulty up:", { maxExtraEnemies, enemyBaseSpeed });
    }

    // UPDATE LOGIC
    const allEnemies = [...baseEnemies, ...extraEnemies];

    // Update enemies
    for (let e of allEnemies) e.update(dt);

    // Update projectiles
    for (let p of projectiles) p.update(dt);

    // Handle projectile arrivals -> create explosions
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if (p.arrived) {
            explosions.push(new Explosion(p.pos, {
                maxRadius: 50,       // red circle size
                duration: 0.35,      // red circle duration
                numParticles: 30,    // how many yellow particles
                radiusMin: 2,
                radiusMax: 6,
                speedMin: 100,
                speedMax: 250,
                particleLife: 0.5,
                gravity: 50          // optional downward pull
              }));
            projectiles.splice(i, 1);
        }
    }

    // Update explosions (apply damage once)
    for (let ex of explosions) ex.update(dt, allEnemies, collectibles);

    // Cleanup dead enemies
    for (let arr of [baseEnemies, extraEnemies]) {
        for (let i = arr.length - 1; i >= 0; i--) {
            const enemy = arr[i];
            if (!enemy.dead) continue;        // skip live enemies

            // award points only if explosion killed it
            if (enemy.killedByExplosion) {
                score += enemy.score;

                floatingTexts.push(
                    new FloatingText(
                        `${enemy.score}`,
                        enemy.pos.x,
                        enemy.pos.y,
                        "limegreen"
                    )
                    
                );
            }

            arr.splice(i, 1);
        }
    }

    // Cleanup dead explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        if (explosions[i].dead) explosions.splice(i, 1);
    }

    if (lives <= 0) {
      baseEnemies.length = 0;  // empties the array
      extraEnemies.length = 0; // empties the array
      gameState = "gameOverScreen";
    }

    collectibles.forEach(c => c.update());

    // Remove off-screen collectibles
    collectibles = collectibles.filter(c => c.y < canvas.height + 50);

    player.cooldownTimer -= dt;

    // RENDER
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    // Background
    ctx.fillStyle = '#071021';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.drawImage(loadedImages.bgImg,0,0,GAME_W, GAME_H);

    floatingTexts = floatingTexts.filter(ft => {
      ft.update();
      ft.draw(ctx);
      return ft.opacity > 0;
    });

    // Draw all enemies
    for (let e of allEnemies) e.draw(ctx);

    // Draw projectiles
    for (let p of projectiles) p.draw(ctx);

    // Draw explosions
    for (let ex of explosions) ex.draw(ctx);

    collectibles.forEach(c => c.draw(ctx));

    // Draw player
    player.draw(ctx);
    gameStats();

}

function introScreen() {
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    ctx.drawImage(loadedImages.introImg,0,0);
/*
    ctx.font = "70px PixelPurl";
    ctx.textAlign = "center";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.fillStyle = "black";
    ctx.strokeText("CLICK TO PLAY", GAME_W/2, 700);
    ctx.fillText("CLICK TO PLAY", GAME_W/2, 700);
*/
    uiButtons
      .filter(btn => btn.screen === "introScreen")
      .forEach(btn => btn.draw());
}

function gameOverScreen() {
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    ctx.drawImage(loadedImages.gameOverBg,0,0)
    
    ctx.font = "100px PixelPurl";
    ctx.textAlign = "center";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.fillStyle = "red";
    ctx.strokeText("GAME OVER", GAME_W/2, 175);
    ctx.fillText("GAME OVER", GAME_W/2, 175);

    ctx.font = "50px PixelPurl";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.fillStyle = "black";
    ctx.strokeText(`SCORE : ${score}`, GAME_W/2, 250);
    ctx.fillText(`SCORE : ${score}`, GAME_W/2, 250);

    //ctx.strokeText("CLICK RMB TO PLAY AGAIN", GAME_W/2, 425);
    //ctx.fillText("CLICK RMB TO PLAY AGAIN", GAME_W/2, 425);

    uiButtons
      .filter(btn => btn.screen === "gameOverScreen")
      .forEach(btn => btn.draw());
}



(async () => {
    console.log("Loading images...");
    loadedImages = await loadAllImages(images);

    console.log("All images loaded!");

    player = new Player(loadedImages.bombardImg);

    createUIButtons();

    scheduleNextCollectible();
    scheduleNextGold();

    requestAnimationFrame(gameLoop);
})();


canvas.addEventListener("mousedown", (e) => {
  handlePointerInput(e.clientX, e.clientY);
});

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault(); // stop scrolling / zooming

  const touch = e.changedTouches[0];
  handlePointerInput(touch.clientX, touch.clientY);
}, { passive: false });

canvas.addEventListener("contextmenu", (e) => {e.preventDefault()});
/*
canvas.addEventListener('mousedown', (e) => {
  if (gameState === "introScreen") {
    gameState = "gameScreen";
    return
  }

  if (!player.canShoot()) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / DPR / rect.width;
  const scaleY = canvas.height / DPR / rect.height;

  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  projectiles.push(player.shoot(new Vec(x, y)));
});


*/
