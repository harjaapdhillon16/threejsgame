// @ts-nocheck
'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

const PhotorealisticFPS = () => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const clockRef = useRef(null);
  const gameRef = useRef({
    enemies: [],
    bullets: [],
    particles: [],
    moveState: { forward: false, backward: false, left: false, right: false, sprint: false },
    canShoot: true,
    shootCooldown: 0,
    initialized: false
  });

  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [ammo, setAmmo] = useState(30);
  const [kills, setKills] = useState(0);
  const [headshots, setHeadshots] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [combo, setCombo] = useState(0);

  // Initialize Three.js scene only once
  useEffect(() => {
    if (!mountRef.current || gameRef.current.initialized) return;
    gameRef.current.initialized = true;

    // Initialize Three.js
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x101015, 0.02);
    scene.background = new THREE.Color(0x000510);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.01,
      1000
    );
    camera.position.set(0, 1.7, 10);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Clock
    clockRef.current = new THREE.Clock();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404060, 0.3);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 2);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -30;
    sunLight.shadow.camera.right = 30;
    sunLight.shadow.camera.top = 30;
    sunLight.shadow.camera.bottom = -30;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.95,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const gridHelper = new THREE.GridHelper(100, 100, 0x00ff00, 0x002200);
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Create barriers
    const barrierMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.9,
      metalness: 0.1
    });

    for (let i = 0; i < 5; i++) {
      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2, 0.5),
        barrierMaterial
      );
      barrier.position.set(
        (Math.random() - 0.5) * 20,
        1,
        -5 - Math.random() * 15
      );
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      scene.add(barrier);
    }

    // Create simple enemies
    const createEnemy = (x, z) => {
      const enemy = new THREE.Group();

      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.6,
        metalness: 0.2
      });

      // Body
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.6, 0.4),
        bodyMaterial
      );
      body.position.y = 0.8;

      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 6),
        new THREE.MeshStandardMaterial({
          color: 0x2a2a2a,
          roughness: 0.3,
          metalness: 0.7
        })
      );
      head.position.y = 1.8;

      enemy.add(body);
      enemy.add(head);
      enemy.position.set(x, 0, z);
      enemy.userData = {
        health: 100,
        speed: 0.02,
        isActive: true,
        shootTimer: 0
      };

      scene.add(enemy);
      gameRef.current.enemies.push(enemy);
    };

    // Spawn enemies
    for (let i = 0; i < 5; i++) {
      createEnemy(
        (Math.random() - 0.5) * 20,
        -10 - Math.random() * 10
      );
    }

    // Weapon
    const weaponGroup = new THREE.Group();
    const weaponMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.2,
      metalness: 0.9
    });

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.6),
      weaponMaterial
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.3, -0.1, -0.6);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.12, 0.4),
      weaponMaterial
    );
    body.position.set(0.3, -0.15, -0.4);

    weaponGroup.add(barrel);
    weaponGroup.add(body);
    weaponGroup.userData = { basePosition: new THREE.Vector3(0, 0, 0) };
    camera.add(weaponGroup);
    scene.add(camera);

    // Crosshair
    const crosshairMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const crosshairGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.01, 0, -1),
      new THREE.Vector3(0.01, 0, -1)
    ]);
    const crosshair = new THREE.Line(crosshairGeometry, crosshairMaterial);
    camera.add(crosshair);

    // Store weapon reference
    gameRef.current.weapon = weaponGroup;

    // Start render loop
    const animate = () => {
      if (!mountRef.current) return;
      requestAnimationFrame(animate);

      const delta = clockRef.current.getDelta();

      // Skip if paused
      if (isPaused || gameOver) {
        rendererRef.current.render(scene, camera);
        return;
      }

      // Update shoot cooldown
      if (gameRef.current.shootCooldown > 0) {
        gameRef.current.shootCooldown -= delta;
        if (gameRef.current.shootCooldown <= 0) {
          gameRef.current.canShoot = true;
        }
      }

      // Player movement
      const moveSpeed = gameRef.current.moveState.sprint ? 0.15 : 0.08;
      const direction = new THREE.Vector3();

      if (gameRef.current.moveState.forward) direction.z -= 1;
      if (gameRef.current.moveState.backward) direction.z += 1;
      if (gameRef.current.moveState.left) direction.x -= 1;
      if (gameRef.current.moveState.right) direction.x += 1;

      if (direction.length() > 0) {
        direction.normalize();
        direction.applyQuaternion(camera.quaternion);
        direction.y = 0;
        camera.position.add(direction.multiplyScalar(moveSpeed));

        // Constrain position
        camera.position.x = Math.max(-25, Math.min(25, camera.position.x));
        camera.position.z = Math.max(-25, Math.min(25, camera.position.z));
      }

      // Update bullets
      gameRef.current.bullets = gameRef.current.bullets.filter(bullet => {
        bullet.position.add(bullet.userData.velocity.clone().multiplyScalar(delta));
        bullet.userData.lifetime -= delta;

        // Check enemy collisions
        let hit = false;
        gameRef.current.enemies.forEach(enemy => {
          if (!enemy.userData.isActive) return;

          const distance = bullet.position.distanceTo(enemy.position);
          if (distance < 1.5) {
            hit = true;
            enemy.userData.health -= 25;

            if (enemy.userData.health <= 0) {
              enemy.userData.isActive = false;
              enemy.visible = false;
              setKills(k => k + 1);
              setScore(s => s + 100);

              // Respawn after delay
              setTimeout(() => {
                enemy.userData.health = 100;
                enemy.userData.isActive = true;
                enemy.visible = true;
                enemy.position.x = (Math.random() - 0.5) * 20;
                enemy.position.z = -10 - Math.random() * 10;
              }, 3000);
            }
          }
        });

        if (hit || bullet.userData.lifetime <= 0) {
          scene.remove(bullet);
          return false;
        }
        return true;
      });

      // Update enemies
      gameRef.current.enemies.forEach(enemy => {
        if (!enemy.userData.isActive) return;

        const toPlayer = new THREE.Vector3();
        toPlayer.subVectors(camera.position, enemy.position);
        toPlayer.y = 0;

        const distance = enemy.position.distanceTo(camera.position);

        if (distance > 3) {
          toPlayer.normalize();
          enemy.position.add(toPlayer.multiplyScalar(enemy.userData.speed));
        }

        // Enemy shooting
        enemy.userData.shootTimer -= delta;
        if (enemy.userData.shootTimer <= 0 && distance < 15) {
          enemy.userData.shootTimer = 2;

          const enemyBullet = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
          );
          enemyBullet.position.copy(enemy.position);
          enemyBullet.position.y = 1.5;

          const bulletDir = toPlayer.clone().normalize();
          enemyBullet.userData = {
            velocity: bulletDir.multiplyScalar(0.5),
            lifetime: 3,
            isEnemyBullet: true
          };

          scene.add(enemyBullet);
          gameRef.current.bullets.push(enemyBullet);
        }

        enemy.lookAt(camera.position.x, enemy.position.y, camera.position.z);
      });

      // Check enemy bullets hitting player
      gameRef.current.bullets.forEach(bullet => {
        if (bullet.userData.isEnemyBullet) {
          const distance = bullet.position.distanceTo(camera.position);
          if (distance < 1) {
            setHealth(h => {
              const newHealth = Math.max(0, h - 10);
              if (newHealth <= 0) setGameOver(true);
              return newHealth;
            });
            scene.remove(bullet);
            gameRef.current.bullets = gameRef.current.bullets.filter(b => b !== bullet);
          }
        }
      });

      // Update particles
      gameRef.current.particles = gameRef.current.particles.filter(particle => {
        particle.position.add(particle.userData.velocity);
        particle.userData.lifetime -= delta;

        if (particle.material.opacity !== undefined) {
          particle.material.opacity = particle.userData.lifetime;
        }

        if (particle.userData.lifetime <= 0) {
          scene.remove(particle);
          return false;
        }
        return true;
      });

      rendererRef.current.render(scene, camera);
    };

    animate();

    return () => {
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, []); // Empty dependency array - only run once

  // Mouse controls
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!cameraRef.current || isPaused || gameOver) return;

      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      cameraRef.current.rotation.y -= movementX * 0.002;
      cameraRef.current.rotation.x -= movementY * 0.002;
      cameraRef.current.rotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraRef.current.rotation.x));
    };

    const handleMouseDown = (e) => {
      if (e.button === 0 && cameraRef.current && sceneRef.current) {
        shoot();
      }
    };

    const shoot = () => {
      if (!gameRef.current.canShoot || ammo <= 0) return;

      setAmmo(a => Math.max(0, a - 1));
      gameRef.current.canShoot = false;
      gameRef.current.shootCooldown = 0.15;

      // Muzzle flash
      const flash = new THREE.PointLight(0xffaa00, 3, 5);
      flash.position.copy(cameraRef.current.position);
      sceneRef.current.add(flash);
      setTimeout(() => sceneRef.current.remove(flash), 50);

      // Create bullet
      const bullet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.005, 0.2),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
      );

      bullet.position.copy(cameraRef.current.position);
      const direction = new THREE.Vector3(0, 0, -1);
      direction.applyQuaternion(cameraRef.current.quaternion);
      bullet.userData = { velocity: direction.multiplyScalar(2), lifetime: 2 };

      sceneRef.current.add(bullet);
      gameRef.current.bullets.push(bullet);

      // Weapon recoil
      if (gameRef.current.weapon) {
        gameRef.current.weapon.position.z = 0.05;
        gameRef.current.weapon.rotation.x = -0.02;
        setTimeout(() => {
          if (gameRef.current.weapon) {
            gameRef.current.weapon.position.z = 0;
            gameRef.current.weapon.rotation.x = 0;
          }
        }, 100);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isPaused, gameOver, ammo]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key.toLowerCase()) {
        case 'w': gameRef.current.moveState.forward = true; break;
        case 's': gameRef.current.moveState.backward = true; break;
        case 'a': gameRef.current.moveState.left = true; break;
        case 'd': gameRef.current.moveState.right = true; break;
        case 'shift': gameRef.current.moveState.sprint = true; break;
        case 'r': setAmmo(30); break;
        case 'escape': setIsPaused(p => !p); break;
      }
    };

    const handleKeyUp = (e) => {
      switch (e.key.toLowerCase()) {
        case 'w': gameRef.current.moveState.forward = false; break;
        case 's': gameRef.current.moveState.backward = false; break;
        case 'a': gameRef.current.moveState.left = false; break;
        case 'd': gameRef.current.moveState.right = false; break;
        case 'shift': gameRef.current.moveState.sprint = false; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Pointer lock
  useEffect(() => {
    const handleClick = () => {
      if (!document.pointerLockElement && mountRef.current) {
        mountRef.current.requestPointerLock();
      }
    };

    if (mountRef.current) {
      mountRef.current.addEventListener('click', handleClick);
      return () => {
        mountRef.current?.removeEventListener('click', handleClick);
      };
    }
  }, []);

  // Window resize
  useEffect(() => {
    const handleResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-4 text-white pointer-events-none">
        <div className="flex justify-between items-start">
          <div className="space-y-3 bg-black bg-opacity-50 p-4 rounded-lg backdrop-blur-sm">
            <div className="text-3xl font-bold text-yellow-400">
              SCORE: {score.toLocaleString()}
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-sm uppercase">Health</span>
              <div className="w-48 h-6 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${health > 50 ? 'bg-green-500' : health > 25 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                  style={{ width: `${health}%` }}
                />
              </div>
              <span className="text-sm font-bold">{health}%</span>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-sm uppercase">Ammo</span>
              <span className={`font-bold ${ammo <= 10 ? 'text-red-500' : 'text-green-500'}`}>
                {ammo}/30
              </span>
              {ammo === 0 && <span className="text-yellow-500 ml-2">Press R to reload!</span>}
            </div>

            <div className="text-xl font-bold text-green-400">KILLS: {kills}</div>
          </div>

          <div className="bg-black bg-opacity-50 p-4 rounded-lg backdrop-blur-sm text-sm space-y-1">
            <div>WASD - Move</div>
            <div>SHIFT - Sprint</div>
            <div>MOUSE - Aim</div>
            <div>CLICK - Fire</div>
            <div>R - Reload</div>
            <div>ESC - Pause</div>
          </div>
        </div>
      </div>

      {/* Game Over */}
      {gameOver && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center">
          <div className="text-center text-white">
            <h1 className="text-7xl font-bold mb-4 text-red-600">GAME OVER</h1>
            <p className="text-2xl mb-4">Final Score: {score.toLocaleString()}</p>
            <p className="text-xl mb-8">Total Kills: {kills}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {/* Pause */}
      {isPaused && !gameOver && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="text-center text-white">
            <h1 className="text-5xl font-bold mb-4">PAUSED</h1>
            <p className="text-xl">Press ESC to continue</p>
          </div>
        </div>
      )}

      {/* Start Screen */}

    </div>
  );
};

const ClientOnly = () => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // window is only defined in the browser
    if (typeof window !== "undefined") {
      setIsClient(true);
    }
  }, []);

  if (!isClient) {
    return null; // Render nothing on server or until mounted
  }

  return <PhotorealisticFPS />;
};

export default ClientOnly;
