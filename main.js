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

// ---- Canvas setup ----
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

const images = {
    bgImg: 'bg.png',
    tomatoImg: 'tomato.png',
    cauliImg: 'cauli.png',
    cabbageImg: 'cabbage.png',
    pumpkinImg: 'pumpkin.png',
    turnipImg: 'turnip.png',
    introImg: 'vegintro.png',
    bombardImg: 'bombard.png',
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

// ---- Game objects ----
class Enemy {
  constructor(x, y, r=12, speed=120){
    this.pos = new Vec(x,y);
    this.r = r;
    this.speed = speed; // pixels per second
    this.dead = false;
    
    this.imgs = [loadedImages.cauliImg,loadedImages.cabbageImg,
      loadedImages.pumpkinImg, loadedImages.turnipImg];
      
    this.type = Math.floor(Math.random() * this.imgs.length);
    this.image = this.imgs[this.type];

    // Assign score per type
    this.score = [10, 20, 30, 40][this.type]; // cauli=10, cabbage=20, etc.

    this.killedByExplosion = false;
  }

  update(dt){
    this.pos.y += this.speed * dt;

    if(this.pos.y - this.r > GAME_H && !this.dead) {
      this.dead = true;
      this.killedByExplosion = false;
      lives -= 1;
    } // fell off screen

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
      for (let e of enemies) {
        if (!e.dead && Vec.dist(e.pos, this.pos) <= this.maxRadius + e.r) {
          e.dead = true;
          e.killedByExplosion = true; 
        }
      }
      this._applied = true;
    }

    // Update particles
    for (let p of this.particles) p.update(dt);

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


// ---- Game state ----
let player;
const enemies = [];
const projectiles = [];
const explosions = [];

let gameState = "introScreen";
let loadedImages;
let spawnTimer = 0;
const spawnInterval = 1.1;

// DIFFICULTY CONTROLS
let difficultyTimer = 0;
let difficultyInterval = 10;
let enemyBaseSpeed = 100;
let enemySpeedIncrease = 10;
let enemySpeedMultiplier = 1;
const baseEnemies = [];
const extraEnemies = [];
const allEnemies = [...baseEnemies, ...extraEnemies];
let score = 0;
let lives = 3;

let maxExtraEnemies = 0;
let lastTime = performance.now();

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

// ---- Spawning enemies ----
// original base spawn (fixed)
function spawnBaseEnemy() {
    const x = 20 + Math.random() * (GAME_W - 40);
    const y = -20;
    const r = 15;
    const speed = 80 + Math.random() * 40; // random speed
    baseEnemies.push(new Enemy(x, y, r, speed));
}

// Spawn extra enemies (difficulty-controlled)
function spawnExtraEnemy() {
    if (extraEnemies.length >= maxExtraEnemies) return;
    const x = 20 + Math.random() * (GAME_W - 40);
    const y = -20;
    const r = 15;
    const speed = enemyBaseSpeed * (0.8 + Math.random() * 0.4); // random variation
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
}

// ---- Main game screen ----
function gameScreen(dt) {
    // --- SPAWN LOGIC ---

    spawnTimer += dt;
    while (spawnTimer >= spawnInterval) {
        spawnTimer -= spawnInterval;
        if (baseEnemies.length < 5) spawnBaseEnemy();
    }

    // Spawn extra enemies gradually
    spawnExtraEnemy();

    // --- DIFFICULTY SCALING ---
    difficultyTimer += dt;
    if (difficultyTimer >= difficultyInterval) {
        difficultyTimer = 0;
        maxExtraEnemies += 1;          // allow more extra enemies
        enemyBaseSpeed += enemySpeedIncrease; // faster new enemies
        console.log("Difficulty up:", { maxExtraEnemies, enemyBaseSpeed });
    }

    // --- UPDATE LOGIC ---
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
    for (let ex of explosions) ex.update(dt, allEnemies);

    // Cleanup dead enemies
    for (let arr of [baseEnemies, extraEnemies]) {
        for (let i = arr.length - 1; i >= 0; i--) {
            const enemy = arr[i];
            if (!enemy.dead) continue;        // skip live enemies

            // award points only if explosion killed it
            if (enemy.killedByExplosion) {
                score += enemy.score;
            }

            arr.splice(i, 1);                 // now remove it
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
    // --- PLAYER UPDATE ---
    player.cooldownTimer -= dt;

    // --- RENDER ---
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    // Background
    ctx.fillStyle = '#071021';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.drawImage(loadedImages.bgImg,0,0,GAME_W, GAME_H);

    // Draw all enemies
    for (let e of allEnemies) e.draw(ctx);

    // Draw projectiles
    for (let p of projectiles) p.draw(ctx);

    // Draw explosions
    for (let ex of explosions) ex.draw(ctx);

    // Draw player
    player.draw(ctx);
    gameStats();
}

function introScreen() {
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    ctx.drawImage(loadedImages.introImg,0,0);

    ctx.font = "70px PixelPurl";
    ctx.textAlign = "center";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.fillStyle = "black";
    ctx.strokeText("CLICK TO PLAY", GAME_W/2, 700);
    ctx.fillText("CLICK TO PLAY", GAME_W/2, 700);
}

function gameOverScreen() {
    ctx.clearRect(0, 0, GAME_W, GAME_H);
    
    ctx.font = "100px PixelPurl";
    ctx.textAlign = "center";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.fillStyle = "red";
    ctx.strokeText("GAME OVER", GAME_W/2, 400);
    ctx.fillText("GAME OVER", GAME_W/2, 400);

    ctx.font = "50px PixelPurl";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.fillStyle = "black";
    ctx.strokeText(`SCORE : ${score}`, GAME_W/2, 550);
    ctx.fillText(`SCORE : ${score}`, GAME_W/2, 550);

    ctx.strokeText("CLICK RMB TO PLAY AGAIN", GAME_W/2, 600);
    ctx.fillText("CLICK RMB TO PLAY AGAIN", GAME_W/2, 600);
}



(async () => {
    console.log("Loading images...");
    loadedImages = await loadAllImages(images);

    console.log("All images loaded!");

    player = new Player(loadedImages.bombardImg);

    requestAnimationFrame(gameLoop);
})();

// ---- prevent context menu on right click inside canvas ----
canvas.addEventListener('contextmenu', e=>e.preventDefault());




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

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault(); // stop the browser's right-click menu
  if (gameState === "gameOverScreen") {
    gameState = "introScreen";
    resetGame();
    return;
  }
});
