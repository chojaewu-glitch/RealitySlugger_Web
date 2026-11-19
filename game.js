
/*
 * REALITY SLUGGER - 3주차 game.js
 * 투구 시작 한 번으로 10구 자동 진행
 * 카메라 스윙 / 키보드 스윙 / 타격 연출 유지
 */
(() => {
    'use strict';

    const $ = id => document.getElementById(id);

    // 경기 기록
    const scoreText = $('score');
    const homerunText = $('homeruns');
    const hitText = $('hits');
    const maxDistanceText = $('maxDistance');
    const pitchCountText = $('pitchCount');
    const resultText = $('resultText');
    const resultDetail = $('resultDetail');

    // 야구장 요소
    const baseball = $('baseball');
    const pitcher = $('pitcher');
    const batter = $('batterAvatar');
    const gameField = $('gameField');

    // 타격 연출
    const impact = $('impactEffect');
    const particles = $('hitParticles');
    const flight = $('ballFlight');
    const flightBall = $('flightBall');
    const flightDistance = $('flightDistance');
    const homeRunBanner = $('homeRunBanner');
    const flash = $('fieldFlash');
    const message = $('fieldMessage');

    // 투구 정보
    const pitchHud = $('pitchHud');
    const roundNumber = $('roundNumber');
    const pitchName = $('pitchName');
    const pitchSpeed = $('pitchSpeed');

    // 게임 조작
    const pitchButton = $('pitchButton');
    const swingButton = $('swingButton');
    const resetButton = $('resetButton');
    const difficulty = $('difficulty');
    const pitchType = $('pitchType');

    // 스트라이크존 및 카운트 표시
    const zoneCells =
        [...document.querySelectorAll('.zone-cell')];

    const outLamps =
        [...document.querySelectorAll('.lamp-red')];

    const strikeLamps =
        [...document.querySelectorAll('.lamp-orange')];

    const ballLamps =
        [...document.querySelectorAll('.lamp-green')];

    // 경기당 투구 수
    const TOTAL_PITCHES = 10;

    // 난이도별 타격 타이밍 허용 범위
    const RULES = {
        easy: {
            homerun: 290,
            hit: 480,
            foul: 700
        },

        normal: {
            homerun: 200,
            hit: 370,
            foul: 560
        },

        hard: {
            homerun: 120,
            hit: 250,
            foul: 410
        }
    };

    // 구종별 공 속도와 이동 시간
    const PITCHES = {
        fast: {
            name: '직구',
            time: 1480,
            min: 137,
            max: 151
        },

        slider: {
            name: '슬라이더',
            time: 1780,
            min: 120,
            max: 135
        },

        change: {
            name: '체인지업',
            time: 2140,
            min: 105,
            max: 120
        }
    };

    // 현재 경기 기록
    let score = 0;
    let homeruns = 0;
    let hits = 0;
    let maxDistance = 0;
    let pitchCount = 0;

    let outs = 0;
    let strikes = 0;
    let balls = 0;

    // 게임 진행 상태
    let running = false;
    let activePitch = null;
    let nextPitchTimer = null;

    // 애니메이션 관리
    let effectTimers = [];
    let distanceFrame = null;

    // 랜덤 숫자 생성
    function randomInt(min, max) {
        return Math.floor(
            Math.random() * (max - min + 1)
        ) + min;
    }

    // 점수판 갱신
    function updateScoreboard() {

        scoreText.textContent =
            score.toLocaleString('ko-KR');

        homerunText.textContent = homeruns;
        hitText.textContent = hits;

        maxDistanceText.textContent =
            maxDistance + 'm';

        pitchCountText.textContent =
            `${pitchCount} / ${TOTAL_PITCHES}`;

        outLamps.forEach((lamp, i) => {
            lamp.classList.toggle('on', i < outs);
        });

        strikeLamps.forEach((lamp, i) => {
            lamp.classList.toggle('on', i < strikes);
        });

        ballLamps.forEach((lamp, i) => {
            lamp.classList.toggle('on', i < balls);
        });
    }

    // 스트라이크 증가
    function addStrike() {

        strikes++;

        if (strikes >= 3) {
            outs = Math.min(3, outs + 1);
            strikes = 0;
            balls = 0;
        }
    }

    // 볼 증가
    function addBall() {

        balls++;

        if (balls >= 4) {
            balls = 0;
            strikes = 0;
        }
    }

    // 스트라이크존 초기화
    function clearZone() {

        zoneCells.forEach(cell => {
            cell.classList.remove('target');
        });
    }

    // 애니메이션 종료 예약
    function later(ms, fn) {

        const timer = setTimeout(fn, ms);

        effectTimers.push(timer);
    }

    // CSS 애니메이션 다시 실행
    function replay(element, className) {

        element.classList.remove(className);

        void element.offsetWidth;

        element.classList.add(className);
    }

    // 기존 타격 효과 초기화
    function clearEffects() {

        effectTimers.forEach(clearTimeout);
        effectTimers = [];

        if (distanceFrame !== null) {

            cancelAnimationFrame(distanceFrame);
            distanceFrame = null;
        }

        [
            impact,
            particles,
            flight,
            flightDistance,
            homeRunBanner
        ].forEach(element => {

            element.classList.add('hidden');

            element.classList.remove(
                'active',
                'flying',
                'show'
            );
        });

        message.classList.remove(
            'show',
            'home-run'
        );

        flash.classList.remove('show');
        pitcher.classList.remove('throwing');
        batter.classList.remove('swinging');
        gameField.classList.remove('shake');
    }

    // 타격 결과 메시지 출력
    function showMessage(text, isHomeRun = false) {

        message.textContent = text;

        message.classList.toggle(
            'home-run',
            isHomeRun
        );

        replay(message, 'show');
        replay(flash, 'show');

        later(1100, () => {

            message.classList.remove('show');
            flash.classList.remove('show');
        });
    }

    // 타자 스윙 애니메이션
    function animateBatter() {

        batter.classList.remove('hidden');

        replay(batter, 'swinging');

        later(520, () => {
            batter.classList.remove('swinging');
        });
    }

    // 비거리 숫자 애니메이션
    function animateDistance(meters, duration) {

        const begin = performance.now();

        function tick(now) {

            const ratio = Math.min(
                1,
                (now - begin) / duration
            );

            const eased =
                1 - Math.pow(1 - ratio, 3);

            flightDistance.textContent =
                Math.round(meters * eased) + 'm';

            if (ratio < 1) {

                distanceFrame =
                    requestAnimationFrame(tick);

            } else {

                distanceFrame = null;
            }
        }

        distanceFrame =
            requestAnimationFrame(tick);
    }

    // 홈런 및 안타 연출
    function celebrateHit(isHomeRun, meters) {

        // 충격파와 파티클 표시
        impact.classList.remove('hidden');
        particles.classList.remove('hidden');

        // 타격 후 공 비행
        flight.classList.remove('hidden');
        flightDistance.classList.remove('hidden');

        // 홈런일 때 더 오래 비행
        flightBall.style.animationDuration =
            isHomeRun ? '1.7s' : '1s';

        replay(impact, 'active');
        replay(particles, 'active');

        replay(flight, 'flying');
        replay(flightDistance, 'show');

        // 비거리 표시
        animateDistance(
            meters,
            isHomeRun ? 1550 : 950
        );

        // 충격파 종료
        later(650, () => {

            impact.classList.add('hidden');
            particles.classList.add('hidden');
        });

        // 타구 비행 종료
        later(
            isHomeRun ? 1850 : 1150,
            () => {

                flight.classList.add('hidden');
                flightDistance.classList.add('hidden');
            }
        );

        // 홈런 축하 화면
        if (isHomeRun) {

            replay(gameField, 'shake');

            later(1450, () => {

                homeRunBanner.classList.remove(
                    'hidden'
                );

                replay(homeRunBanner, 'show');
            });

            later(3650, () => {

                homeRunBanner.classList.add(
                    'hidden'
                );

                homeRunBanner.classList.remove(
                    'show'
                );

                gameField.classList.remove(
                    'shake'
                );
            });
        }
    }

    /*
     * 야구공 위치 계산
     * 공이 보이지 않는 문제를 방지하기 위해
     * 위치와 표시 상태를 직접 지정
     */
    function drawBaseball(progress, pitch) {

        const p = Math.max(
            0,
            Math.min(progress, 1.3)
        );

        const near = Math.min(p, 1);

        // 공의 가로 위치
        const x =
            50 + (pitch.targetX - 50) * near;

        // 공의 세로 위치
        const y =
            4 + (pitch.targetY - 4) * p;

        // 공이 가까워질수록 커짐
        const scale =
            0.7 + p * 1.1;

        // 공 표시 설정
        baseball.style.position = 'absolute';
        baseball.style.display = 'block';
        baseball.style.visibility = 'visible';
        baseball.style.opacity = '1';

        baseball.style.zIndex = '50';
        baseball.style.width = '46px';
        baseball.style.height = '46px';

        baseball.style.left = `${x}%`;
        baseball.style.top = `${y}%`;

        baseball.style.transform =
            `translate(-50%, -50%) scale(${scale})`;
    }

    // 공이 날아오는 애니메이션
    function animatePitch(now, pitch) {

        if (
            !running ||
            activePitch !== pitch
        ) {
            return;
        }

        const elapsed =
            now - pitch.startTime;

        const progress =
            elapsed / pitch.travelTime;

        drawBaseball(progress, pitch);

        // 공이 지나갔는데 스윙하지 않은 경우
        if (elapsed >= pitch.travelTime + 450) {

            noSwing();
            return;
        }

        // 다음 프레임
        pitch.frameId = requestAnimationFrame(
            time => animatePitch(time, pitch)
        );
    }

    // 한 번의 투구 시작
    function startPitch() {

        if (
            !running ||
            activePitch ||
            pitchCount >= TOTAL_PITCHES
        ) {
            return;
        }

        // 이전 연출 제거
        clearEffects();
        clearZone();

        pitchCount++;

        // 구종 설정
        const type =
            PITCHES[pitchType.value] ||
            PITCHES.fast;

        const speed = randomInt(
            type.min,
            type.max
        );

        const travelTime =
            type.time + randomInt(-80, 80);

        // 스트라이크존 목표 위치
        const cell = randomInt(0, 8);

        const row =
            Math.floor(cell / 3);

        const col = cell % 3;

        const isStrike =
            Math.random() < 0.85;

        const targetX = isStrike
            ? ((col + 0.5) / 3) * 100
            : (Math.random() < 0.5 ? -15 : 115);

        const targetY =
            ((row + 0.5) / 3) * 100;

        // 스트라이크존 강조
        if (isStrike) {

            zoneCells[cell].classList.add(
                'target'
            );
        }

        // 투구 정보 표시
        roundNumber.textContent =
            `${pitchCount} / ${TOTAL_PITCHES}`;

        pitchName.textContent =
            type.name;

        pitchSpeed.textContent =
            `${speed} km/h`;

        pitchHud.classList.remove('hidden');

        // 투수가 던지는 애니메이션
        replay(pitcher, 'throwing');

        later(700, () => {
            pitcher.classList.remove('throwing');
        });

        // 현재 투구 데이터
        const startTime = performance.now();

        const pitch = {
            startTime,

            arrivalTime:
                startTime + travelTime,

            travelTime,
            targetX,
            targetY,
            isStrike,

            level:
                RULES[difficulty.value] ||
                RULES.normal,

            frameId: null
        };

        activePitch = pitch;

        // 야구공 표시
        baseball.classList.remove('hidden');

        drawBaseball(0, pitch);

        resultText.textContent =
            'PITCHING...';

        resultDetail.textContent =
            `${pitchCount}번째 투구 · ` +
            `${type.name} ${speed}km/h · ` +
            '공이 가까워지면 스윙하세요!';

        updateScoreboard();

        // 공 이동 시작
        pitch.frameId = requestAnimationFrame(
            time => animatePitch(time, pitch)
        );
    }

    /*
     * 한 번의 투구 종료
     * 다음 투구를 자동으로 시작하는 함수
     */
    function finishPitch(delay) {

        if (!activePitch) {
            return;
        }

        // 현재 공 이동 중단
        if (activePitch.frameId !== null) {

            cancelAnimationFrame(
                activePitch.frameId
            );
        }

        activePitch = null;

        // 현재 공 숨기기
        baseball.classList.add('hidden');

        clearZone();
        updateScoreboard();

        // 결과를 보여준 뒤 다음 투구 시작
        const wait =
            Math.max(delay, 1500);

        nextPitchTimer = setTimeout(() => {

            nextPitchTimer = null;

            if (!running) {
                return;
            }

            // 10구가 끝난 경우
            if (pitchCount >= TOTAL_PITCHES) {

                running = false;

                pitchButton.textContent =
                    '경기 종료';

                pitchButton.disabled = true;

                difficulty.disabled = false;
                pitchType.disabled = false;

                resultText.textContent =
                    'GAME OVER';

                resultDetail.textContent =
                    `10구 종료! 최종 점수 ` +
                    `${score.toLocaleString('ko-KR')}점 · ` +
                    `홈런 ${homeruns}개 · ` +
                    `안타 ${hits}개. ` +
                    '다시 하려면 게임 초기화를 누르세요.';

            } else {

                // 다음 공 자동 투구
                startPitch();
            }

        }, wait);
    }

    // 카메라 또는 버튼 스윙 처리
    function swing(source = '카메라') {

        if (
            !running ||
            !activePitch
        ) {
            return;
        }

        const pitch = activePitch;

        const now = performance.now();

        // 공 도착 시간과 스윙 시간의 차이
        const error = Math.abs(
            now - pitch.arrivalTime
        );

        const margin = pitch.level;

        // 타자 캐릭터 스윙
        animateBatter();

        // 홈런
        if (error <= margin.homerun) {

            const meters =
                randomInt(120, 155);

            homeruns++;
            score += 1000;

            maxDistance = Math.max(
                maxDistance,
                meters
            );

            strikes = 0;
            balls = 0;

            resultText.textContent =
                'HOME RUN!';

            resultDetail.textContent =
                `${source} 스윙 성공! ` +
                `비거리 ${meters}m · +1000점`;

            showMessage('HOME RUN!', true);

            celebrateHit(true, meters);

            // 홈런 연출 후 다음 투구
            finishPitch(3900);
        }

        // 안타
        else if (error <= margin.hit) {

            const meters =
                randomInt(65, 110);

            hits++;
            score += 300;

            maxDistance = Math.max(
                maxDistance,
                meters
            );

            strikes = 0;
            balls = 0;

            resultText.textContent =
                '안타!';

            resultDetail.textContent =
                `${source} 스윙 성공! ` +
                `비거리 ${meters}m · +300점`;

            showMessage('HIT!');

            celebrateHit(false, meters);

            finishPitch(1750);
        }

        // 파울
        else if (error <= margin.foul) {

            // 파울은 스트라이크 2개까지만 증가
            if (strikes < 2) {
                strikes++;
            }

            resultText.textContent =
                '파울!';

            resultDetail.textContent =
                '조금 빗맞았습니다. 다음 공을 준비하세요.';

            showMessage('FOUL');

            finishPitch(1650);
        }

        // 헛스윙
        else {

            addStrike();

            resultText.textContent =
                '헛스윙!';

            resultDetail.textContent =
                now < pitch.arrivalTime
                    ? '너무 일찍 휘둘렀습니다.'
                    : '너무 늦게 휘둘렀습니다.';

            showMessage('MISS');

            finishPitch(1650);
        }
    }

    // 스윙하지 않은 경우
    function noSwing() {

        if (!activePitch) {
            return;
        }

        if (activePitch.isStrike) {

            addStrike();

            resultText.textContent =
                '스트라이크!';

            resultDetail.textContent =
                '스윙하지 않아 스트라이크 판정입니다.';

            showMessage('STRIKE');

        } else {

            addBall();

            resultText.textContent =
                '볼!';

            resultDetail.textContent =
                '공이 스트라이크존 밖으로 지나갔습니다.';

            showMessage('BALL');
        }

        finishPitch(1650);
    }

    /*
     * 경기 시작
     * 버튼 한 번으로 10구 자동 진행
     */
    function startGame() {

        if (running) {
            return;
        }

        // 초기화된 상태에서만 경기 시작
        if (pitchCount > 0) {
            return;
        }

        running = true;

        pitchButton.disabled = true;

        pitchButton.textContent =
            '경기 진행 중 (자동 10구)';

        difficulty.disabled = true;
        pitchType.disabled = true;

        // 첫 번째 투구
        startPitch();
    }

    // 전체 게임 초기화
    function resetGame() {

        running = false;

        // 진행 중인 공 이동 중단
        if (
            activePitch &&
            activePitch.frameId !== null
        ) {

            cancelAnimationFrame(
                activePitch.frameId
            );
        }

        activePitch = null;

        // 다음 공 자동 진행 취소
        if (nextPitchTimer !== null) {

            clearTimeout(nextPitchTimer);
            nextPitchTimer = null;
        }

        clearEffects();
        clearZone();

        // 점수 초기화
        score = 0;
        homeruns = 0;
        hits = 0;
        maxDistance = 0;
        pitchCount = 0;

        outs = 0;
        strikes = 0;
        balls = 0;

        // 게임 화면 초기화
        baseball.classList.add('hidden');

        batter.classList.remove('hidden');
        pitchHud.classList.add('hidden');

        pitchButton.textContent =
            '⚾ 투구 시작';

        pitchButton.disabled = false;

        difficulty.disabled = false;
        pitchType.disabled = false;

        resultText.textContent =
            'READY';

        resultDetail.textContent =
            '투구 시작을 한 번 누르면 ' +
            '10구가 자동 진행됩니다. ' +
            '빨간 표식을 휘둘러 보세요!';

        updateScoreboard();
    }

    /*
     * camera.js와 연결
     * 카메라에서 스윙을 인식하면 실행
     */
    window.RealitySlugger =
        window.RealitySlugger || {};

    window.RealitySlugger.cameraSwing =
        () => swing('카메라');

    // 버튼 이벤트 연결
    pitchButton.addEventListener(
        'click',
        startGame
    );

    swingButton.addEventListener(
        'click',
        () => swing('버튼')
    );

    resetButton.addEventListener(
        'click',
        resetGame
    );

    // 스페이스바로 스윙 테스트
    document.addEventListener(
        'keydown',
        event => {

            if (
                event.code !== 'Space' ||
                event.repeat
            ) {
                return;
            }

            const tag =
                event.target?.tagName;

            if (
                [
                    'INPUT',
                    'TEXTAREA',
                    'SELECT',
                    'BUTTON'
                ].includes(tag)
            ) {
                return;
            }

            event.preventDefault();

            swing('키보드');
        }
    );

    // 게임 최초 초기화
    resetGame();

})();
