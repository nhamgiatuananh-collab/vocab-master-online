// PHASE 3: WOW FACTOR
// Handles Lenis Smooth Scrolling, Custom Cursor, and GSAP ScrollTrigger Animations

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize GSAP Plugins
    gsap.registerPlugin(ScrollTrigger);

    // 2. Initialize Lenis Smooth Scroll
    const lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        direction: 'vertical',
        gestureDirection: 'vertical',
        smooth: true,
        mouseMultiplier: 1,
        smoothTouch: false,
        touchMultiplier: 2,
        infinite: false,
    });

    // Keep ScrollTrigger in sync with Lenis
    lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add((time)=>{
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    // 3. Custom Cursor Logic
    const cursor = document.getElementById('customCursor');
    if (cursor) {
        // Use GSAP quickTo for ultra-smooth performance
        const xTo = gsap.quickTo(cursor, "x", {duration: 0.05, ease: "power1.out"});
        const yTo = gsap.quickTo(cursor, "y", {duration: 0.05, ease: "power1.out"});

        window.addEventListener("mousemove", (e) => {
            xTo(e.clientX);
            yTo(e.clientY);
            
            // Show cursor if it was hidden
            if(cursor.classList.contains('hidden')) {
                cursor.classList.remove('hidden');
            }
        });

        window.addEventListener("mouseout", () => {
            cursor.classList.add('hidden');
        });

        // Add magnetic/glow effect to interactive elements
        const interactiveSelectors = 'a, button, input, textarea, select, .workspace-card, .word-card, .search-result-item';
        
        // Use event delegation for dynamic elements
        document.body.addEventListener('mouseover', (e) => {
            const target = e.target.closest(interactiveSelectors);
            if (target) {
                cursor.classList.add('active');
            }
        });

        document.body.addEventListener('mouseout', (e) => {
            const target = e.target.closest(interactiveSelectors);
            if (target) {
                cursor.classList.remove('active');
            }
        });
    }

    // 4. GSAP ScrollTrigger Animations (Auto-applied via MutationObserver for dynamically loaded content)
    // We observe the body for newly added cards and apply ScrollTrigger to them.
    const animateCards = (cards) => {
        cards.forEach(card => {
            // Check if already animated to prevent duplicate triggers
            if(card.dataset.gsapAnimated) return;
            card.dataset.gsapAnimated = "true";

            gsap.fromTo(card, 
                { y: 50, opacity: 0 },
                { 
                    y: 0, 
                    opacity: 1, 
                    duration: 0.6, 
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: card,
                        start: "top 95%",
                        toggleActions: "play none none reverse"
                    }
                }
            );
        });
    };

    // Initial static cards (Dashboard)
    animateCards(document.querySelectorAll('.workspace-card, .stat-card'));

    // Observe for dynamic cards (Library words)
    const observer = new MutationObserver((mutations) => {
        let newCards = [];
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.classList.contains('word-card')) newCards.push(node);
                    // Also check children in case a container was added
                    const childCards = node.querySelectorAll('.word-card');
                    if (childCards.length > 0) newCards.push(...childCards);
                }
            });
        });
        
        if (newCards.length > 0) {
            // Small delay to ensure layout is calculated
            setTimeout(() => {
                ScrollTrigger.refresh();
                animateCards(newCards);
            }, 50);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Ensure ScrollTrigger refreshes when switching workspaces
    window.addEventListener('hashchange', () => {
        setTimeout(() => ScrollTrigger.refresh(), 500);
    });
});


