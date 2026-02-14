import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function PirateScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    ships: THREE.Group[];
    water: THREE.Mesh;
    animationId: number;
  } | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0e1a, 0.02);

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 15, 35);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x4488ff, 0.3);
    scene.add(ambientLight);

    const moonLight = new THREE.DirectionalLight(0x88ccff, 0.8);
    moonLight.position.set(10, 20, 10);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 2048;
    moonLight.shadow.mapSize.height = 2048;
    scene.add(moonLight);

    // Rim light for dramatic effect
    const rimLight = new THREE.DirectionalLight(0xff6600, 0.5);
    rimLight.position.set(-10, 5, -10);
    scene.add(rimLight);

    // Water plane
    const waterGeometry = new THREE.PlaneGeometry(200, 200, 100, 100);
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a2540,
      metalness: 0.8,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9,
    });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -5;
    water.receiveShadow = true;
    scene.add(water);

    // Create animated waves
    const positions = waterGeometry.attributes.position;
    const vertex = new THREE.Vector3();
    const waveData: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      waveData.push(Math.random() * Math.PI * 2);
    }

    // Create pirate ships
    const ships: THREE.Group[] = [];
    
    // Ship 1 (Left)
    const ship1 = createPirateShip(0xff3333);
    ship1.position.set(-15, 0, -5);
    ship1.rotation.y = Math.PI / 6;
    scene.add(ship1);
    ships.push(ship1);

    // Ship 2 (Right)
    const ship2 = createPirateShip(0x3366ff);
    ship2.position.set(15, 0, -5);
    ship2.rotation.y = -Math.PI / 6;
    scene.add(ship2);
    ships.push(ship2);

    // Floating debris/barrels
    for (let i = 0; i < 8; i++) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8),
        new THREE.MeshStandardMaterial({ 
          color: 0x6b4423,
          roughness: 0.9 
        })
      );
      barrel.position.set(
        (Math.random() - 0.5) * 40,
        -4.5,
        (Math.random() - 0.5) * 40
      );
      barrel.rotation.z = Math.random() * Math.PI;
      barrel.castShadow = true;
      scene.add(barrel);
    }

    // Storm clouds (using particles)
    const cloudGeometry = new THREE.BufferGeometry();
    const cloudPositions = [];
    for (let i = 0; i < 500; i++) {
      cloudPositions.push(
        (Math.random() - 0.5) * 200,
        Math.random() * 30 + 20,
        (Math.random() - 0.5) * 200
      );
    }
    cloudGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(cloudPositions, 3)
    );
    const cloudMaterial = new THREE.PointsMaterial({
      color: 0x2a3f5f,
      size: 2,
      transparent: true,
      opacity: 0.6,
    });
    const clouds = new THREE.Points(cloudGeometry, cloudMaterial);
    scene.add(clouds);

    // Animation
    let time = 0;
    let isAnimating = true;
    
    function animate() {
      // Check if we should continue animating
      if (!isAnimating || !sceneRef.current) {
        return;
      }

      time += 0.01;

      // Animate waves
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        const waveX = Math.sin(vertex.x * 0.5 + time * 2 + waveData[i]) * 0.3;
        const waveZ = Math.cos(vertex.y * 0.5 + time * 2 + waveData[i]) * 0.3;
        positions.setY(i, waveX + waveZ);
      }
      positions.needsUpdate = true;

      // Animate ships (bobbing)
      ships.forEach((ship, index) => {
        ship.position.y = Math.sin(time * 1.5 + index * Math.PI) * 0.5;
        ship.rotation.z = Math.sin(time * 1.2 + index) * 0.05;
      });

      // Rotate clouds slowly
      clouds.rotation.y += 0.0002;

      // Camera gentle sway
      camera.position.x = Math.sin(time * 0.3) * 2;
      camera.position.y = 15 + Math.sin(time * 0.5) * 1;

      renderer.render(scene, camera);
      
      // Store animation ID only if ref is still valid
      if (sceneRef.current) {
        sceneRef.current.animationId = requestAnimationFrame(animate);
      }
    }

    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Store refs
    sceneRef.current = {
      scene,
      camera,
      renderer,
      ships,
      water,
      animationId: 0,
    };

    return () => {
      isAnimating = false;
      window.removeEventListener('resize', handleResize);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        renderer.dispose();
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="pirate-scene-canvas" />;
}

// Helper function to create a simple pirate ship
function createPirateShip(flagColor: number): THREE.Group {
  const ship = new THREE.Group();

  // Hull
  const hullGeometry = new THREE.BoxGeometry(3, 1.5, 6);
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a2511,
    roughness: 0.8,
  });
  const hull = new THREE.Mesh(hullGeometry, hullMaterial);
  hull.position.y = -0.5;
  hull.castShadow = true;
  ship.add(hull);

  // Deck
  const deckGeometry = new THREE.BoxGeometry(2.5, 0.2, 5);
  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4423,
    roughness: 0.9,
  });
  const deck = new THREE.Mesh(deckGeometry, deckMaterial);
  deck.position.y = 0.5;
  ship.add(deck);

  // Mast
  const mastGeometry = new THREE.CylinderGeometry(0.1, 0.15, 6, 8);
  const mastMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a1f0f,
    roughness: 0.95,
  });
  const mast = new THREE.Mesh(mastGeometry, mastMaterial);
  mast.position.y = 3.5;
  mast.castShadow = true;
  ship.add(mast);

  // Sail
  const sailGeometry = new THREE.PlaneGeometry(2, 3);
  const sailMaterial = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    side: THREE.DoubleSide,
    roughness: 0.7,
  });
  const sail = new THREE.Mesh(sailGeometry, sailMaterial);
  sail.position.set(0, 4, 0);
  sail.castShadow = true;
  ship.add(sail);

  // Flag
  const flagGeometry = new THREE.PlaneGeometry(1, 0.7);
  const flagMaterial = new THREE.MeshStandardMaterial({
    color: flagColor,
    side: THREE.DoubleSide,
    emissive: flagColor,
    emissiveIntensity: 0.3,
  });
  const flag = new THREE.Mesh(flagGeometry, flagMaterial);
  flag.position.set(0, 6.5, 0);
  ship.add(flag);

  // Add skull & crossbones to flag
  const skullGeometry = new THREE.SphereGeometry(0.15, 8, 8);
  const skullMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.5,
  });
  const skull = new THREE.Mesh(skullGeometry, skullMaterial);
  skull.position.set(0, 6.5, 0.01);
  ship.add(skull);

  // Cannons
  for (let i = -1; i <= 1; i += 2) {
    const cannonGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
    const cannonMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.8,
    });
    const cannon = new THREE.Mesh(cannonGeometry, cannonMaterial);
    cannon.position.set(i * 1.5, 0.3, 1);
    cannon.rotation.z = Math.PI / 2;
    cannon.castShadow = true;
    ship.add(cannon);
  }

  return ship;
}