document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================
    // GLOBAL STATE & CONSTANTS
    // =========================================
    let currentUploadedUrl = null;
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';
    const POLL_INTERVAL = 2000; // 2 seconds
    const MAX_POLLS = 60; // Max 2 minutes

    // =========================================
    // API HELPER FUNCTIONS
    // =========================================

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension (no media/ prefix)
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        console.log('Uploaded to:', downloadUrl);
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        // Configuration: photoToVectorArt is an image effect
        const isVideo = 'image-effects' === 'video-effects'; 
        const endpoint = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        let body = {};
        if (isVideo) {
            body = {
                imageUrl: [imageUrl],
                effectId: 'photoToVectorArt',
                userId: USER_ID,
                removeWatermark: true,
                model: 'video-effects',
                isPrivate: true
            };
        } else {
            body = {
                model: 'image-effects',
                toolType: 'image-effects',
                effectId: 'photoToVectorArt',
                imageUrl: imageUrl,
                userId: USER_ID,
                removeWatermark: true,
                isPrivate: true
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('Job submitted:', data.jobId, 'Status:', data.status);
        return data;
    }

    // Poll job status
    async function pollJobStatus(jobId) {
        const isVideo = 'image-effects' === 'video-effects';
        const baseUrl = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // =========================================
    // UI HELPER FUNCTIONS
    // =========================================

    function showLoading() {
        const loader = document.getElementById('loading-state');
        const resultContainer = document.getElementById('result-container') || document.querySelector('.result-display');
        const resultPlaceholder = document.getElementById('result-placeholder-text');
        
        if (loader) {
            loader.style.display = 'flex';
            loader.classList.remove('hidden');
        }
        if (resultPlaceholder) resultPlaceholder.style.display = 'none'; // Ensure placeholder is hidden
        if (resultContainer) resultContainer.classList.add('loading');
    }

    function hideLoading() {
        const loader = document.getElementById('loading-state');
        const resultContainer = document.getElementById('result-container') || document.querySelector('.result-display');
        
        if (loader) {
            loader.style.display = 'none';
            loader.classList.add('hidden');
        }
        if (resultContainer) resultContainer.classList.remove('loading');
    }

    function updateStatus(text) {
        let statusText = document.getElementById('status-text') || document.querySelector('.status-text');
        
        // Fix: Create status element if it doesn't exist (handles JS_ID_MISMATCH)
        if (!statusText) {
            const loader = document.getElementById('loading-state');
            if (loader) {
                statusText = document.createElement('p');
                statusText.id = 'status-text';
                statusText.className = 'status-text mt-3 text-sm text-gray-400 font-medium text-center';
                loader.appendChild(statusText);
            }
        }

        if (statusText) statusText.textContent = text;
        
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            if (text.includes('PROCESSING') || text.includes('UPLOADING') || text.includes('SUBMITTING')) {
                generateBtn.disabled = true;
                generateBtn.textContent = text;
            } else if (text === 'READY') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Vector Art';
            } else if (text === 'COMPLETE') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generated!';
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg);
        updateStatus('ERROR');
    }

    function showPreview(url) {
        const img = document.getElementById('preview-image');
        const uploadContent = document.querySelector('.upload-content');
        const resetBtn = document.getElementById('reset-btn');
        
        if (img) {
            img.src = url;
            img.style.display = 'block';
            img.classList.remove('hidden');
        }
        if (uploadContent) uploadContent.classList.add('hidden');
        if (resetBtn) resetBtn.classList.remove('hidden');
    }

    function showResultMedia(url) {
        const resultImg = document.getElementById('result-final');
        const container = resultImg ? resultImg.parentElement : document.querySelector('.result-area');
        const resultPlaceholder = document.getElementById('result-placeholder-text');
        
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        if (!container) return;
        
        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        
        if (isVideo) {
            if (resultImg) {
                resultImg.style.display = 'none';
                resultImg.classList.add('hidden');
            }
            
            let video = document.getElementById('result-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'result-video';
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                video.className = resultImg ? resultImg.className : 'w-full h-auto rounded-lg';
                video.style.maxWidth = '100%';
                container.appendChild(video);
            }
            video.src = url;
            video.style.display = 'block';
        } else {
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            if (resultImg) {
                resultImg.style.display = 'block';
                resultImg.classList.remove('hidden');
                resultImg.crossOrigin = 'anonymous';
                resultImg.src = url;
                // Remove simulated filter if it exists
                resultImg.style.filter = 'none';
            }
        }
    }

    function showDownloadButton(url) {
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.style.display = 'inline-block';
            downloadBtn.classList.remove('hidden');
        }
    }

    // =========================================
    // MAIN LOGIC HANDLERS
    // =========================================

    async function handleFileSelect(file) {
        try {
            // Local preview first for immediate feedback (optional, but good UX)
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.getElementById('preview-image');
                if (img) img.src = e.target.result;
            };
            reader.readAsDataURL(file);

            showLoading();
            updateStatus('UPLOADING...');
            
            // Upload immediately
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Show the uploaded image preview (switches to CDN URL)
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            hideLoading();
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    async function handleGenerate() {
        if (!currentUploadedUrl) return;
        
        const generateBtn = document.getElementById('generate-btn');
        const downloadBtn = document.getElementById('download-btn');
        
        // Hide previous results
        if (downloadBtn) downloadBtn.classList.add('hidden');
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // Step 1: Submit job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('JOB QUEUED...');
            
            // Step 2: Poll for completion
            const result = await pollJobStatus(jobData.jobId);
            
            // Step 3: Parse result
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) {
                console.error('Response:', result);
                throw new Error('No image URL in response');
            }
            
            console.log('Result image URL:', resultUrl);
            currentUploadedUrl = resultUrl; // Update current URL for potential download
            
            // Step 4: Display result
            showResultMedia(resultUrl);
            
            updateStatus('COMPLETE');
            hideLoading();
            showDownloadButton(resultUrl);
            
            // Scroll to result on mobile
            if (window.innerWidth < 768) {
                const resultContainer = document.getElementById('result-container');
                if (resultContainer) resultContainer.scrollIntoView({ behavior: 'smooth' });
            }
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // =========================================
    // EVENT WIRING
    // =========================================

    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadBtn = document.getElementById('download-btn');

    if (dropZone && fileInput) {
        // Drag & Drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('highlight'), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('highlight'), false);
        });
        
        dropZone.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        }, false);
        
        dropZone.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentUploadedUrl = null;
            if (fileInput) fileInput.value = '';
            
            const previewImg = document.getElementById('preview-image');
            const uploadContent = document.querySelector('.upload-content');
            const resultImg = document.getElementById('result-final');
            const resultPlaceholder = document.getElementById('result-placeholder-text');
            const resultVideo = document.getElementById('result-video');
            
            if (previewImg) {
                previewImg.src = '';
                previewImg.classList.add('hidden');
            }
            if (uploadContent) uploadContent.classList.remove('hidden');
            
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generate Vector Art';
            }
            
            resetBtn.classList.add('hidden');
            
            // Reset result side
            if (resultImg) {
                resultImg.classList.add('hidden');
                resultImg.src = '';
                resultImg.style.filter = "none";
            }
            if (resultVideo) resultVideo.style.display = 'none';
            if (resultPlaceholder) {
                resultPlaceholder.style.display = 'block';
                resultPlaceholder.classList.remove('hidden');
            }
            if (downloadBtn) downloadBtn.classList.add('hidden');
        });
    }

    // Download Button - Robust Implementation
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            try {
                const response = await fetch(url, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (!response.ok) throw new Error('Failed to fetch file');
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const contentType = response.headers.get('content-type') || '';
                let extension = 'jpg';
                if (contentType.includes('video') || url.match(/\.(mp4|webm)/i)) extension = 'mp4';
                else if (contentType.includes('png') || url.match(/\.png/i)) extension = 'png';
                else if (contentType.includes('webp') || url.match(/\.webp/i)) extension = 'webp';
                
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'vector_art_' + generateNanoId(8) + '.' + extension;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
            } catch (err) {
                console.error('Download error:', err);
                
                // Fallback: Canvas for images
                try {
                    const img = document.getElementById('result-final');
                    if (img && img.style.display !== 'none' && img.complete && img.naturalWidth > 0) {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        
                        canvas.toBlob((blob) => {
                            if (blob) {
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(blob);
                                link.download = 'vector_art_fallback_' + generateNanoId(8) + '.png';
                                link.click();
                                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
                            } else {
                                window.open(url, '_blank');
                            }
                        }, 'image/png');
                        return;
                    }
                } catch (canvasErr) {
                    console.error('Canvas fallback error:', canvasErr);
                }
                
                // Final fallback
                alert('Direct download failed. Opening in new tab.');
                window.open(url, '_blank');
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // =========================================
    // MOBILE MENU
    // =========================================
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
        });
        
        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    // =========================================
    // FAQ ACCORDION
    // =========================================
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(btn => {
        btn.addEventListener('click', () => {
            const answer = btn.nextElementSibling;
            const isActive = btn.classList.contains('active');
            
            faqQuestions.forEach(otherBtn => {
                if (otherBtn !== btn) {
                    otherBtn.classList.remove('active');
                    otherBtn.nextElementSibling.style.maxHeight = null;
                }
            });
            
            btn.classList.toggle('active');
            if (!isActive) {
                answer.style.maxHeight = answer.scrollHeight + "px";
            } else {
                answer.style.maxHeight = null;
            }
        });
    });

    // =========================================
    // MODALS
    // =========================================
    const modalButtons = document.querySelectorAll('[data-modal-target]');
    const closeButtons = document.querySelectorAll('[data-modal-close]');
    
    function openModal(modalId) {
        const modal = document.getElementById(modalId + '-modal');
        if (modal) modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    function closeModal(modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
    
    modalButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(btn.dataset.modalTarget);
        });
    });
    
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.closest('.modal'));
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // =========================================
    // SCROLL ANIMATIONS
    // =========================================
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.step-card, .feature-card, .gallery-item, .testimonial-card').forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = `opacity 0.6s ease-out ${index * 0.1}s, transform 0.6s ease-out ${index * 0.1}s`;
        observer.observe(el);
    });

    document.querySelectorAll('.step-card, .feature-card, .gallery-item, .testimonial-card').forEach(el => {
        el.addEventListener('transitionend', () => {
            if (el.classList.contains('visible')) {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }
        });
    });

    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        .visible { opacity: 1 !important; transform: translateY(0) !important; }
        .fade-in-up { animation: fadeInUp 0.8s ease-out forwards; opacity: 0; }
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(styleSheet);
});