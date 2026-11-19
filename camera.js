
/*
 * REALITY SLUGGER - WEEK 03
 * 빨간색 물체 추적 및 스윙 감지
 * PC / 스마트폰 카메라 지원
 */

(() => {
    'use strict';

    // HTML 요소 연결
    const video = document.getElementById('cameraFeed');
    const button = document.getElementById('cameraButton');
    const indicator = document.getElementById('cameraIndicator');
    const placeholder = document.getElementById('cameraPlaceholder');
    const cameraStatus = document.getElementById('cameraStatus');

    const marker = document.getElementById('trackingMarker');
    const markerLabel = document.getElementById('trackingLabel');
    const trackingStatus = document.getElementById('trackingStatus');
    const trackingBar = document.getElementById('trackingBar');

    const sensitivity = document.getElementById('sensitivity');
    const facingSelect = document.getElementById('cameraFacing');

    // 영상 분석 해상도
    const WIDTH = 192;
    const HEIGHT = 144;

    const GRID_W = WIDTH / 2;
    const GRID_H = HEIGHT / 2;

    // 빨간색 분석용 캔버스
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const ctx = canvas.getContext('2d', {
        willReadFrequently: true
    });

    // 스윙 감도
    const levels = {
        high: {
            minPixels: 8,
            distance: 0.085,
            speed: 0.35
        },

        normal: {
            minPixels: 14,
            distance: 0.13,
            speed: 0.52
        },

        low: {
            minPixels: 25,
            distance: 0.20,
            speed: 0.85
        }
    };

    // 카메라 상태 변수
    let stream = null;
    let opening = false;
    let frameId = null;

    let lastScan = 0;
    let lastSeen = 0;
    let lastSwing = 0;

    // 빨간 물체 추적 변수
    let previous = null;
    let smooth = null;
    let history = [];

    let cameraRequest = 0;

    // 카메라 방향
    let facingMode =
        facingSelect?.value === 'environment'
            ? 'environment'
            : 'user';

    // 현재 감도 설정
    function getLevel() {
        return levels[sensitivity.value] ||
            levels.normal;
    }

    // 카메라 UI 상태 변경
    function updateUI(connected, message) {

        indicator.textContent =
            connected ? 'LIVE' : 'OFF';

        indicator.classList.toggle(
            'active',
            connected
        );

        // 카메라 연결 시 안내 화면 숨기기
        placeholder.classList.toggle(
            'hidden',
            connected
        );

        button.textContent =
            connected ? '카메라 끄기' : '카메라 연결';

        cameraStatus.textContent = message;

        if (!connected) {

            marker.classList.add('hidden');

            markerLabel.textContent =
                'RED TARGET · NOT FOUND';

            trackingStatus.textContent =
                '빨간 표식을 카메라에 보여주세요.';

            trackingBar.style.width = '0%';
        }
    }

    // 추적 기록 초기화
    function clearTracking() {

        previous = null;
        smooth = null;
        history = [];

        marker.classList.add('hidden');

        markerLabel.textContent =
            'RED TARGET · NOT FOUND';

        trackingBar.style.width = '0%';
    }

    // 카메라 종료
    function stopCamera() {

        cameraRequest++;
        opening = false;
        button.disabled = false;

        if (frameId !== null) {
            cancelAnimationFrame(frameId);
        }

        frameId = null;

        if (stream) {
            stream.getTracks().forEach(track => {
                track.stop();
            });

            stream = null;
        }

        video.pause();
        video.srcObject = null;

        clearTracking();

        updateUI(
            false,
            '카메라가 꺼졌습니다.'
        );
    }

    /*
     * 빨간색 물체 찾기
     * 영상에서 빨간색 픽셀들을 검색하고
     * 연결된 영역을 하나의 물체로 묶음
     */
    function findRedBlobs() {

        // 전면 카메라만 좌우 반전
        if (facingMode === 'user') {

            ctx.setTransform(
                -1, 0, 0, 1, WIDTH, 0
            );

        } else {

            ctx.setTransform(
                1, 0, 0, 1, 0, 0
            );
        }

        // 카메라 프레임 가져오기
        ctx.drawImage(
            video,
            0, 0,
            WIDTH, HEIGHT
        );

        // 캔버스 변환 원상복구
        ctx.setTransform(
            1, 0, 0, 1, 0, 0
        );

        const data = ctx.getImageData(
            0, 0, WIDTH, HEIGHT
        ).data;

        const mask = new Uint8Array(
            GRID_W * GRID_H
        );

        const visited = new Uint8Array(
            mask.length
        );

        // 빨간색 픽셀 검사
        for (let gy = 0; gy < GRID_H; gy++) {

            for (let gx = 0; gx < GRID_W; gx++) {

                const x = gx * 2;
                const y = gy * 2;

                const i = (y * WIDTH + x) * 4;

                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                if (
                    r > 105 &&
                    r > g * 1.4 &&
                    r > b * 1.32 &&
                    r - Math.max(g, b) > 40
                ) {
                    mask[gy * GRID_W + gx] = 1;
                }
            }
        }

        const blobs = [];

        // 주변 8방향
        const neighbors = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0], [1, 0],
            [-1, 1], [0, 1], [1, 1]
        ];

        // 연결된 빨간색 영역 검색
        for (let i = 0; i < mask.length; i++) {

            if (!mask[i] || visited[i]) {
                continue;
            }

            const queue = [i];

            visited[i] = 1;

            let head = 0;
            let size = 0;

            let sumX = 0;
            let sumY = 0;

            while (head < queue.length) {

                const index = queue[head++];

                const x = index % GRID_W;
                const y = Math.floor(index / GRID_W);

                size++;
                sumX += x;
                sumY += y;

                // 주변 픽셀 탐색
                for (const [dx, dy] of neighbors) {

                    const nx = x + dx;
                    const ny = y + dy;

                    if (
                        nx < 0 ||
                        nx >= GRID_W ||
                        ny < 0 ||
                        ny >= GRID_H
                    ) {
                        continue;
                    }

                    const next =
                        ny * GRID_W + nx;

                    if (
                        mask[next] &&
                        !visited[next]
                    ) {
                        visited[next] = 1;
                        queue.push(next);
                    }
                }
            }

            // 너무 작은 잡음이나
            // 지나치게 큰 빨간 배경은 제외
            if (
                size >= getLevel().minPixels &&
                size <= 850
            ) {
                blobs.push({

                    x: (sumX / size + 0.5) / GRID_W,

                    y: (sumY / size + 0.5) / GRID_H,

                    size: size
                });
            }
        }

        return blobs;
    }

    /*
     * 추적할 빨간색 물체 선택
     */
    function chooseBlob(blobs, now) {

        if (!blobs.length) {
            return null;
        }

        // 이전에 추적한 물체가 있으면
        // 그 위치와 가까운 물체 우선 선택
        if (
            previous &&
            now - lastSeen <= 200
        ) {

            let nearest = null;
            let bestDistance = Infinity;

            for (const blob of blobs) {

                const distance = Math.hypot(
                    blob.x - previous.x,
                    blob.y - previous.y
                );

                if (distance < bestDistance) {

                    bestDistance = distance;
                    nearest = blob;
                }
            }

            return bestDistance <= 0.42
                ? nearest
                : null;
        }

        // 처음에는 가장 큰 빨간색 영역 선택
        return blobs.reduce(
            (best, blob) => {

                if (
                    !best ||
                    blob.size > best.size
                ) {
                    return blob;
                }

                return best;

            },
            null
        );
    }

    /*
     * 카메라 영상 분석
     */
    function processFrame(now) {

        if (!stream) {
            return;
        }

        frameId = requestAnimationFrame(
            processFrame
        );

        // 약 25FPS로 분석
        if (
            now - lastScan < 40 ||
            video.readyState < 2
        ) {
            return;
        }

        lastScan = now;

        try {

            const blobs = findRedBlobs();

            const target = chooseBlob(
                blobs,
                now
            );

            // 빨간 물체를 못 찾은 경우
            if (!target) {

                if (now - lastSeen > 180) {
                    clearTracking();
                }

                trackingStatus.textContent =
                    '빨간 표식을 찾는 중... 조명과 배경을 확인하세요.';

                return;
            }

            // 추적이 잠시 끊긴 경우
            if (
                lastSeen &&
                now - lastSeen > 120
            ) {
                history = [];
            }

            lastSeen = now;
            previous = target;

            // 추적 표시 흔들림 보정
            if (!smooth) {

                smooth = {
                    x: target.x,
                    y: target.y
                };
            }

            smooth.x =
                smooth.x * 0.4 +
                target.x * 0.6;

            smooth.y =
                smooth.y * 0.4 +
                target.y * 0.6;

            // 빨간 물체 위치 표시
            marker.style.left =
                `${smooth.x * 100}%`;

            marker.style.top =
                `${smooth.y * 100}%`;

            marker.classList.remove('hidden');

            markerLabel.textContent =
                '● RED TARGET TRACKING';

            trackingStatus.textContent =
                '표식 추적 중 · 빠르게 좌우로 휘둘러 보세요.';

            // 최근 이동 기록 저장
            history.push({
                x: target.x,
                y: target.y,
                t: now
            });

            history = history.filter(
                point => now - point.t <= 260
            );

            // 과거 위치 확인
            const start = history.find(
                point => now - point.t >= 120
            );

            if (
                !start ||
                history.length < 4
            ) {
                trackingBar.style.width = '0%';
                return;
            }

            // 이동 거리
            const dx =
                target.x - start.x;

            const dy =
                target.y - start.y;

            const distance =
                Math.abs(dx);

            // 이동 속도
            const elapsed =
                (now - start.t) / 1000;

            const speed =
                distance / elapsed;

            // 이동 방향의 일관성 계산
            let totalTravel = 0;

            for (
                let i = 1;
                i < history.length;
                i++
            ) {

                totalTravel += Math.abs(
                    history[i].x -
                    history[i - 1].x
                );
            }

            const straightness =
                distance /
                Math.max(totalTravel, 0.001);

            const level = getLevel();

            // 스윙 감지 게이지
            const progress = Math.min(
                100,
                Math.round(
                    distance /
                    level.distance * 100
                )
            );

            trackingBar.style.width =
                `${progress}%`;

            /*
             * 실제 스윙 판정 조건
             */
            const validSwing =

                // 충분한 좌우 이동 거리
                distance >= level.distance &&

                // 충분한 이동 속도
                speed >= level.speed &&

                // 한 방향으로 이동했는지
                straightness >= 0.7 &&

                // 세로 움직임보다 좌우 움직임이 큰지
                distance >= Math.abs(dy) * 0.75 &&

                // 연속 스윙 방지
                now - lastSwing >= 850;

            if (validSwing) {

                lastSwing = now;

                // 같은 스윙 중복 감지 방지
                history = [];

                trackingStatus.textContent =
                    '스윙 동작 감지!';

                trackingBar.style.width =
                    '100%';

                // game.js에 스윙 신호 전달
                if (
                    window.RealitySlugger &&
                    typeof window.RealitySlugger.cameraSwing
                    === 'function'
                ) {
                    window.RealitySlugger.cameraSwing(now);
                }
            }

        } catch (error) {

            trackingStatus.textContent =
                '영상 분석 오류: ' +
                error.message;
        }
    }

    /*
     * 카메라 연결
     */
    async function startCamera() {

        if (opening || stream) {
            return;
        }

        // 카메라 지원 확인
        if (!navigator.mediaDevices?.getUserMedia) {

            updateUI(
                false,
                '카메라를 사용할 수 없습니다. HTTPS 또는 localhost에서 실행하세요.'
            );

            return;
        }

        opening = true;

        const requestId = ++cameraRequest;

        button.disabled = true;

        cameraStatus.textContent =
            '카메라 연결 중...';

        try {

            // PC 또는 스마트폰 카메라 요청
            const active =
                await navigator.mediaDevices.getUserMedia({

                    audio: false,

                    video: {

                        facingMode: {
                            ideal: facingMode
                        },

                        width: {
                            ideal: 640
                        },

                        height: {
                            ideal: 480
                        },

                        frameRate: {
                            ideal: 30
                        }
                    }
                });

            // 이전 연결 요청 취소 처리
            if (requestId !== cameraRequest) {

                active.getTracks().forEach(
                    track => track.stop()
                );

                return;
            }

            stream = active;

            // 전면 카메라는 거울처럼 표시
            video.classList.toggle(
                'mirror',
                facingMode === 'user'
            );

            video.srcObject = active;

            await video.play();

            if (requestId !== cameraRequest) {
                return;
            }

            // 카메라 연결이 끊겼을 때
            active.getVideoTracks().forEach(track => {

                track.addEventListener(
                    'ended',
                    () => {

                        if (stream === active) {
                            stopCamera();
                        }
                    }
                );
            });

            // 상태 초기화
            lastScan = 0;
            lastSeen = 0;
            lastSwing = 0;

            clearTracking();

            updateUI(
                true,
                '카메라 연결 성공! 빨간 표식을 보여주세요.'
            );

            // 영상 표시
            video.style.opacity = '1';
            video.style.visibility = 'visible';

            // 빨간 물체 추적 시작
            frameId = requestAnimationFrame(
                processFrame
            );

        } catch (error) {

            if (requestId !== cameraRequest) {
                return;
            }

            stopCamera();

            let message =
                '카메라 연결 실패: ' +
                (error.message || error.name);

            if (error.name === 'NotAllowedError') {

                message =
                    '카메라 권한이 거부되었습니다. 브라우저 권한을 허용하세요.';

            } else if (error.name === 'NotFoundError') {

                message =
                    '카메라를 찾지 못했습니다. 카메라 장치를 확인하세요.';

            } else if (error.name === 'NotReadableError') {

                message =
                    '다른 프로그램이 카메라를 사용 중일 수 있습니다.';
            }

            updateUI(false, message);

        } finally {

            if (requestId === cameraRequest) {

                opening = false;
                button.disabled = false;
            }
        }
    }

    // 카메라 연결 / 종료 버튼
    button.addEventListener('click', () => {

        if (stream) {
            stopCamera();
        } else {
            startCamera();
        }
    });

    // 전면 / 후면 카메라 변경
    if (facingSelect) {

        facingSelect.addEventListener(
            'change',
            () => {

                const reconnect =
                    Boolean(stream);

                facingMode =
                    facingSelect.value === 'environment'
                        ? 'environment'
                        : 'user';

                stopCamera();

                // 카메라가 켜져 있었다면 재연결
                if (reconnect) {
                    startCamera();
                }
            }
        );
    }

    // 페이지를 닫으면 카메라 종료
    window.addEventListener(
        'pagehide',
        stopCamera
    );

})();
