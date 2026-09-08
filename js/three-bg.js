/**
 * VocabMaster - Three.js Animated Background (GSAP Optimized)
 */

(function () {
    if (typeof THREE === 'undefined') {
        console.error('Three.js is not loaded.');
        return;
    }

    const config = {
        particleCount: 2500,
        maxDistance: 80,
        cameraZ: 400,
        colors: {
            primary: new THREE.Color('#6366f1'),
            accent: new THREE.Color('#06b6d4'),
            amber: new THREE.Color('#f59e0b'),
            lightBackground: 0xf8fafc,
            darkBackground: 0x0f172a
        },
        mouseRepelRadius: 100,
        mouseRepelForce: 2
    };

    const state = {
        theme: 'dark',
        scene: 'dashboard',
        mouseX: window.innerWidth / 2,
        mouseY: window.innerHeight / 2,
        time: 0
    };

    // GSAP Animated Parameters
    const gsapParams = {
        speedMult: 0.5,
        waveIntensity: 0.8,
        rotSpeed: 0.0002,
        gridStrength: 0.0,
        bgR: config.colors.darkBackground >> 16 & 255,
        bgG: config.colors.darkBackground >> 8 & 255,
        bgB: config.colors.darkBackground & 255
    };

    let container, scene, camera, renderer;
    let particles, geometry;
    let linesMesh, lineGeometry;
    let positions, velocities, originalPositions, colors, phases;
    let animationId;

    function init() {
        container = document.createElement('div');
        container.id = 'three-bg-container';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.zIndex = '-1';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);

        scene = new THREE.Scene();
        scene.background = new THREE.Color(config.colors.darkBackground);
        scene.fog = new THREE.FogExp2(config.colors.darkBackground, 0.002);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
        camera.position.z = config.cameraZ;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(renderer.domElement);

        createParticles();

        window.addEventListener('resize', onWindowResize);
        document.addEventListener('mousemove', onMouseMove);
        
        animate();
    }

    function createParticles() {
        const count = config.particleCount;
        
        geometry = new THREE.BufferGeometry();
        positions = new Float32Array(count * 3);
        velocities = new Float32Array(count * 3);
        originalPositions = new Float32Array(count * 3);
        colors = new Float32Array(count * 3);
        phases = new Float32Array(count);

        const colorPrimary = config.colors.primary;
        const colorAccent = config.colors.accent;
        const colorAmber = config.colors.amber;

        for (let i = 0; i < count; i++) {
            const r = 800 * Math.cbrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            originalPositions[i * 3] = x;
            originalPositions[i * 3 + 1] = y;
            originalPositions[i * 3 + 2] = z;

            velocities[i * 3] = 0;
            velocities[i * 3 + 1] = 0;
            velocities[i * 3 + 2] = 0;

            const rand = Math.random();
            let c = colorPrimary;
            if (rand > 0.85) c = colorAccent;
            else if (rand > 0.95) c = colorAmber;

            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;

            phases[i] = Math.random() * Math.PI * 2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

        const shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                attribute vec3 color;
                attribute float phase;
                varying vec3 vColor;
                uniform float time;
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    float size = 3.0 + sin(time * 2.0 + phase) * 1.5;
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;
                    float alpha = (0.5 - dist) * 2.0;
                    gl_FragColor = vec4(vColor, alpha * 0.8);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        particles = new THREE.Points(geometry, shaderMaterial);
        scene.add(particles);

        const maxLines = count * 4;
        lineGeometry = new THREE.BufferGeometry();
        const linePositions = new Float32Array(maxLines * 3);
        const lineColors = new Float32Array(maxLines * 3);
        
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
        lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage));
        
        const lineMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.25,
            depthWrite: false
        });
        
        linesMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
        scene.add(linesMesh);
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function onMouseMove(event) {
        state.mouseX = event.clientX;
        state.mouseY = event.clientY;
    }

    function updateParticles() {
        const count = config.particleCount;
        
        const vecMouse = new THREE.Vector3(
            (state.mouseX / window.innerWidth) * 2 - 1,
            -(state.mouseY / window.innerHeight) * 2 + 1,
            0.5
        );
        vecMouse.unproject(camera);
        const dir = vecMouse.sub(camera.position).normalize();
        const distance = -camera.position.z / dir.z;
        const target = camera.position.clone().add(dir.multiplyScalar(distance));
        
        const linePositions = lineGeometry.attributes.position.array;
        const lineColorsArray = lineGeometry.attributes.color.array;
        let lineIdx = 0;
        
        const checkLines = gsapParams.gridStrength < 0.5;
        
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            
            const x = positions[i3];
            const y = positions[i3 + 1];
            const z = positions[i3 + 2];
            
            const ox = originalPositions[i3];
            const oy = originalPositions[i3 + 1];
            const oz = originalPositions[i3 + 2];
            
            let targetZ = oz + Math.sin(state.time * 0.4 + ox * 0.01 + oy * 0.01) * 30 * gsapParams.waveIntensity;
            let targetX = ox;
            let targetY = oy;
            
            // Grid blend using GSAP animated gridStrength
            if (gsapParams.gridStrength > 0) {
                const gridX = Math.round(ox / 40) * 40;
                const gridY = Math.round(oy / 40) * 40;
                const gridZ = Math.round(oz / 40) * 40;
                
                targetX = targetX * (1 - gsapParams.gridStrength) + gridX * gsapParams.gridStrength;
                targetY = targetY * (1 - gsapParams.gridStrength) + gridY * gsapParams.gridStrength;
                targetZ = targetZ * (1 - gsapParams.gridStrength) + gridZ * gsapParams.gridStrength;
            }
            
            if (target) {
                const dx = target.x - x;
                const dy = target.y - y;
                const distToMouseSq = dx*dx + dy*dy;
                
                if (distToMouseSq < config.mouseRepelRadius * config.mouseRepelRadius) {
                    const dist = Math.sqrt(distToMouseSq);
                    const force = (config.mouseRepelRadius - dist) / config.mouseRepelRadius;
                    
                    targetX -= (dx / dist) * force * config.mouseRepelForce * 30;
                    targetY -= (dy / dist) * force * config.mouseRepelForce * 30;
                }
            }
            
            velocities[i3]     += (targetX - x) * 0.005 * gsapParams.speedMult;
            velocities[i3 + 1] += (targetY - y) * 0.005 * gsapParams.speedMult;
            velocities[i3 + 2] += (targetZ - z) * 0.005 * gsapParams.speedMult;
            
            velocities[i3]     *= 0.92;
            velocities[i3 + 1] *= 0.92;
            velocities[i3 + 2] *= 0.92;
            
            positions[i3]     += velocities[i3];
            positions[i3 + 1] += velocities[i3 + 1];
            positions[i3 + 2] += velocities[i3 + 2];
            
            if (checkLines && i % 2 === 0) {
                for (let j = i + 1; j < count; j += 3) {
                    if (lineIdx >= linePositions.length / 3) break;
                    
                    const j3 = j * 3;
                    const dx = positions[i3] - positions[j3];
                    const dy = positions[i3 + 1] - positions[j3 + 1];
                    const dz = positions[i3 + 2] - positions[j3 + 2];
                    
                    const distSq = dx*dx + dy*dy + dz*dz;
                    
                    if (distSq < config.maxDistance * config.maxDistance) {
                        linePositions[lineIdx * 3]     = positions[i3];
                        linePositions[lineIdx * 3 + 1] = positions[i3 + 1];
                        linePositions[lineIdx * 3 + 2] = positions[i3 + 2];
                        
                        linePositions[(lineIdx + 1) * 3]     = positions[j3];
                        linePositions[(lineIdx + 1) * 3 + 1] = positions[j3 + 1];
                        linePositions[(lineIdx + 1) * 3 + 2] = positions[j3 + 2];
                        
                        const distFade = 1.0 - Math.sqrt(distSq) / config.maxDistance;
                        const alphaMultiplier = distFade * (state.scene === 'quiz' ? 1.5 : 1.0);
                        
                        lineColorsArray[lineIdx * 3] = colors[i3] * alphaMultiplier;
                        lineColorsArray[lineIdx * 3 + 1] = colors[i3+1] * alphaMultiplier;
                        lineColorsArray[lineIdx * 3 + 2] = colors[i3+2] * alphaMultiplier;
                        
                        lineColorsArray[(lineIdx + 1) * 3] = colors[j3] * alphaMultiplier;
                        lineColorsArray[(lineIdx + 1) * 3 + 1] = colors[j3+1] * alphaMultiplier;
                        lineColorsArray[(lineIdx + 1) * 3 + 2] = colors[j3+2] * alphaMultiplier;
                        
                        lineIdx += 2;
                    }
                }
            }
        }
        
        geometry.attributes.position.needsUpdate = true;
        
        if (checkLines) {
            lineGeometry.setDrawRange(0, lineIdx);
            lineGeometry.attributes.position.needsUpdate = true;
            lineGeometry.attributes.color.needsUpdate = true;
        } else {
            lineGeometry.setDrawRange(0, 0);
        }
        
        particles.material.uniforms.time.value = state.time;
    }

    function animate() {
        animationId = requestAnimationFrame(animate);
        
        state.time += 0.01;
        
        scene.rotation.y += gsapParams.rotSpeed;
        scene.rotation.x = Math.sin(state.time * 0.1) * 0.05;

        // Apply GSAP interpolated background color
        if (scene.background) {
            scene.background.setRGB(gsapParams.bgR / 255, gsapParams.bgG / 255, gsapParams.bgB / 255);
            scene.fog.color.setRGB(gsapParams.bgR / 255, gsapParams.bgG / 255, gsapParams.bgB / 255);
        }
        
        updateParticles();
        renderer.render(scene, camera);
    }

    window.threeBg = {
        setTheme: function(theme) {
            state.theme = theme;
            const c = new THREE.Color(theme === 'dark' ? config.colors.darkBackground : config.colors.lightBackground);
            if (window.gsap) {
                gsap.to(gsapParams, {
                    bgR: c.r * 255,
                    bgG: c.g * 255,
                    bgB: c.b * 255,
                    duration: 1.5,
                    ease: "power2.inOut"
                });
            } else {
                scene.background = c;
                scene.fog.color = c;
            }
            
            if (linesMesh) {
                if (window.gsap) {
                    gsap.to(linesMesh.material, { opacity: theme === 'dark' ? 0.25 : 0.15, duration: 1.5 });
                } else {
                    linesMesh.material.opacity = theme === 'dark' ? 0.25 : 0.15;
                }
            }
        },

        setScene: function(sceneName) {
            const validScenes = ['dashboard', 'library', 'quiz', 'add-word', 'favorites'];
            if (!validScenes.includes(sceneName)) return;
            state.scene = sceneName;
            
            if (!window.gsap) return;

            let targets = { speedMult: 0.5, waveIntensity: 0.8, rotSpeed: 0.0002, gridStrength: 0.0 };
            
            switch (sceneName) {
                case 'dashboard':
                    break;
                case 'quiz':
                    targets = { speedMult: 2.5, waveIntensity: 1.5, rotSpeed: 0.001, gridStrength: 0.0 };
                    break;
                case 'library':
                    targets = { speedMult: 0.2, waveIntensity: 0.2, rotSpeed: 0.0001, gridStrength: 1.0 };
                    break;
                case 'add-word':
                    targets = { speedMult: 0.3, waveIntensity: 1.2, rotSpeed: 0.0005, gridStrength: 0.0 };
                    break;
                case 'favorites':
                    targets = { speedMult: 0.8, waveIntensity: 0.5, rotSpeed: 0.0003, gridStrength: 0.0 };
                    break;
            }

            gsap.to(gsapParams, {
                ...targets,
                duration: 1.5,
                ease: "power2.inOut"
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
