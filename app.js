document.addEventListener("DOMContentLoaded", () => {
    
    // --------------------------------------------------
    // 1. System Initializers & Date Manager (Midnight Reset)
    // --------------------------------------------------
    const dateDisplay = document.getElementById("current-date-display");
    const today = new Date();
    
    // Format: 2026.05.10
    const todayStr = today.getFullYear() + "." + 
                     String(today.getMonth() + 1).padStart(2, '0') + "." + 
                     String(today.getDate()).padStart(2, '0');
    
    if (dateDisplay) {
        dateDisplay.textContent = todayStr;
    }

    // Midnight Auto Reset Logic
    function checkMidnightReset() {
        const lastSavedDate = localStorage.getItem("onestep-daily-date");
        if (lastSavedDate && lastSavedDate !== todayStr) {
            // New day! Reset all checkable daily tasks & subgoals
            const dailyCheckboxes = document.querySelectorAll(".step-cb");
            dailyCheckboxes.forEach(cb => {
                cb.checked = false;
                localStorage.setItem(`onestep-cb-${cb.id}`, "false");
            });
            
            // Reset focus checklist checks (but keep text)
            for (let i = 1; i <= 3; i++) {
                const subCb = document.getElementById(`chk-subgoal-${i}`);
                if (subCb) {
                    subCb.checked = false;
                    localStorage.setItem(`chk-subgoal-${i}`, "false");
                }
            }
            
            launchToast("🌅 迎來全新的一天！每日行動指南已自動重置。");
        }
        localStorage.setItem("onestep-daily-date", todayStr);
    }

    // Manual Reset Button
    const btnManualReset = document.getElementById("btn-manual-reset");
    if (btnManualReset) {
        btnManualReset.addEventListener("click", () => {
            const dailyCheckboxes = document.querySelectorAll(".step-cb");
            dailyCheckboxes.forEach(cb => {
                cb.checked = false;
                localStorage.setItem(`onestep-cb-${cb.id}`, "false");
                // Trigger change event to update parent pills styling
                cb.dispatchEvent(new Event("change"));
            });
            
            // Also reset subgoals checked states
            for (let i = 1; i <= 3; i++) {
                const subCb = document.getElementById(`chk-subgoal-${i}`);
                if (subCb) {
                    subCb.checked = false;
                    localStorage.setItem(`chk-subgoal-${i}`, "false");
                }
            }
            
            updateProgressMetrics();
            launchToast("🔁 今日行動勾選已手動重置！");
        });
    }

    // Clear Custom Boards & Labels (Back to neutral slate)
    const btnClearCustom = document.getElementById("btn-clear-custom");
    if (btnClearCustom) {
        btnClearCustom.addEventListener("click", () => {
            if (confirm("⚠️ 確定要完全初始化您的 OneStep 沙盒嗎？這將會清空所有自訂事項、打勾狀態、各歲數里程碑並重置複利增速曲線！")) {
                // Clear all onestep local storage keys
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith("onestep-") || key.startsWith("chk-subgoal-") || key.startsWith("input-subgoal-")) {
                        localStorage.removeItem(key);
                    }
                });

                // Clear text inputs
                const customLabelInputs = document.querySelectorAll(".editable-group-title, .pill-text-input");
                customLabelInputs.forEach(input => {
                    input.value = "";
                    if (typeof adjustInputWidth === "function") {
                        adjustInputWidth(input);
                    }
                });

                // Reset standard elements
                if (inputDailyOneStep) inputDailyOneStep.value = "";
                for (let i = 1; i <= 3; i++) {
                    const chk = document.getElementById(`chk-subgoal-${i}`);
                    if (chk) chk.checked = false;
                    const inp = document.getElementById(`input-subgoal-${i}`);
                    if (inp) inp.value = "";
                }

                // Uncheck habit boxes
                const checkboxes = document.querySelectorAll(".col-actions .step-cb");
                checkboxes.forEach(cb => {
                    cb.checked = false;
                });

                // Re-initialize factors and empty milestones state
                intrinsicFactor = 1.052;
                extrinsicFactor = 1.055;
                milestones = {};

                // Save & Re-render everything instantly!
                saveMilestones();
                drawCompoundingCurves();
                drawMilestoneDots();
                updateAgeMilestoneDisplay();
                updateProgressMetrics();

                launchToast("🧹 OneStep 沙盒已成功完全初始化！歡迎進入純淨生命本金保護艙。");
            }
        });
    }

    // --------------------------------------------------
    // 2. Focus & Habits Caching & Realtime Calculations
    // --------------------------------------------------
    const inputDailyOneStep = document.getElementById("input-daily-onestep");
    const habitCheckboxes = document.querySelectorAll(".col-actions .step-cb");
    const actionProgressFill = document.getElementById("action-progress-fill");
    const actionProgressText = document.getElementById("action-progress-text");

    // Load / Save Main Priority OneStep
    if (inputDailyOneStep) {
        inputDailyOneStep.value = localStorage.getItem("onestep-main-priority") || "";
        inputDailyOneStep.addEventListener("input", () => {
            localStorage.setItem("onestep-main-priority", inputDailyOneStep.value);
        });
    }

    // Load / Save Subgoals text and checked states
    for (let i = 1; i <= 3; i++) {
        const subInput = document.getElementById(`input-subgoal-${i}`);
        const subCb = document.getElementById(`chk-subgoal-${i}`);
        
        if (subInput) {
            subInput.value = localStorage.getItem(`onestep-subgoal-text-${i}`) || "";
            subInput.addEventListener("input", () => {
                localStorage.setItem(`onestep-subgoal-text-${i}`, subInput.value);
                updateProgressMetrics(); // Recalculate instantly on text edit!
            });
        }
        
        if (subCb) {
            subCb.checked = localStorage.getItem(`chk-subgoal-${i}`) === "true";
            subCb.addEventListener("change", () => {
                localStorage.setItem(`chk-subgoal-${i}`, subCb.checked);
                updateProgressMetrics();
            });
        }
    }

    // Load / Save habit checklist states
    habitCheckboxes.forEach(cb => {
        cb.checked = localStorage.getItem(`onestep-cb-${cb.id}`) === "true";
        
        // Listen for change to cache and recalculate progress bar
        cb.addEventListener("change", () => {
            localStorage.setItem(`onestep-cb-${cb.id}`, cb.checked);
            updateProgressMetrics();
        });
    });

    // Update Overall Action Rates Progress Bar (Only count filled-in items in the denominator)
    function updateProgressMetrics() {
        let totalCount = 0;
        let checkedCount = 0;

        // 1. Subgoals
        for (let i = 1; i <= 3; i++) {
            const subInput = document.getElementById(`input-subgoal-${i}`);
            const subCb = document.getElementById(`chk-subgoal-${i}`);
            if (subInput && subInput.value.trim() !== "") {
                totalCount++;
                if (subCb && subCb.checked) {
                    checkedCount++;
                }
            }
        }

        // 2. Value Habits (col-actions)
        habitCheckboxes.forEach(cb => {
            const container = cb.closest(".pill-cb-label");
            const textInput = container ? container.querySelector(".pill-text-input") : null;
            if (textInput && textInput.value.trim() !== "") {
                totalCount++;
                if (cb.checked) {
                    checkedCount++;
                }
            }
        });

        const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
        
        if (actionProgressFill) {
            actionProgressFill.style.width = progressPct + "%";
        }
        if (actionProgressText) {
            actionProgressText.textContent = progressPct + "%";
        }
    }

    // --------------------------------------------------
    // 3. High-End Strategic Bulletin Board System
    // --------------------------------------------------
    const bulletinList = document.getElementById("bulletin-list");
    const btnAddBulletin = document.getElementById("btn-add-bulletin");

    const defaultBulletins = [];

    let bulletins = defaultBulletins;
    const storedBulletins = localStorage.getItem("onestep-bulletins");
    if (storedBulletins) {
        try {
            bulletins = JSON.parse(storedBulletins);
        } catch (e) {
            console.error(e);
        }
    }

    function saveBulletins() {
        localStorage.setItem("onestep-bulletins", JSON.stringify(bulletins));
    }

    function renderBulletins() {
        if (!bulletinList) return;
        bulletinList.innerHTML = "";
        
        bulletins.forEach((theme) => {
            const item = document.createElement("div");
            item.className = "bulletin-theme-item";
            
            // Theme Header
            const header = document.createElement("div");
            header.className = "theme-header";
            
            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.className = "theme-title-input";
            titleInput.value = theme.title;
            titleInput.placeholder = "輸入主要戰略目標...";
            titleInput.addEventListener("input", () => {
                theme.title = titleInput.value;
                saveBulletins();
            });
            
            const btnDel = document.createElement("button");
            btnDel.className = "btn-del-theme";
            btnDel.innerHTML = "🗑️";
            btnDel.title = "刪除戰略方向";
            btnDel.addEventListener("click", () => {
                bulletins = bulletins.filter(b => b.id !== theme.id);
                saveBulletins();
                renderBulletins();
                launchToast("🗑️ 已刪除該戰略主題");
            });
            
            header.appendChild(titleInput);
            header.appendChild(btnDel);
            item.appendChild(header);
            
            // Subgoals List
            const sublist = document.createElement("div");
            sublist.className = "theme-sublist";
            
            theme.subgoals.forEach((sub) => {
                const row = document.createElement("div");
                row.className = "theme-sub-row";
                
                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.className = "step-cb";
                cb.checked = sub.checked;
                cb.addEventListener("change", () => {
                    sub.checked = cb.checked;
                    saveBulletins();
                });
                
                const subInput = document.createElement("input");
                subInput.type = "text";
                subInput.className = "theme-sub-input";
                subInput.value = sub.text;
                subInput.placeholder = "輸入具體行動子項目...";
                subInput.addEventListener("input", () => {
                    sub.text = subInput.value;
                    saveBulletins();
                });
                
                const btnDelSub = document.createElement("button");
                btnDelSub.className = "btn-del-theme";
                btnDelSub.innerHTML = "×";
                btnDelSub.style.fontSize = "1rem";
                btnDelSub.style.lineHeight = "1";
                btnDelSub.addEventListener("click", () => {
                    theme.subgoals = theme.subgoals.filter(s => s.id !== sub.id);
                    saveBulletins();
                    renderBulletins();
                });
                
                row.appendChild(cb);
                row.appendChild(subInput);
                row.appendChild(btnDelSub);
                sublist.appendChild(row);
            });
            
            // Add Subgoal Action Button
            const btnAddSub = document.createElement("button");
            btnAddSub.className = "btn-add-subgoal";
            btnAddSub.textContent = "+ 新增行動項目";
            btnAddSub.addEventListener("click", () => {
                theme.subgoals.push({
                    id: "sub_" + Date.now() + Math.random().toString(36).substr(2, 4),
                    text: "",
                    checked: false
                });
                saveBulletins();
                renderBulletins();
            });
            
            item.appendChild(sublist);
            item.appendChild(btnAddSub);
            bulletinList.appendChild(item);
        });
    }

    if (btnAddBulletin) {
        btnAddBulletin.addEventListener("click", () => {
            bulletins.push({
                id: "theme_" + Date.now(),
                title: "",
                subgoals: [
                    { id: "sub_" + Date.now(), text: "", checked: false }
                ]
            });
            saveBulletins();
            renderBulletins();
        });
    }

    // --------------------------------------------------
    // 4. Wisdom Siphoner (利息過濾編譯器模擬引擎)
    // --------------------------------------------------
    const rawInsightInput = document.getElementById("raw-insight-input");
    const siphonVibeSelect = document.getElementById("siphon-vibe-select");
    const btnCompileSiphon = document.getElementById("btn-compile-siphon");
    const siphonConsoleOutput = document.getElementById("siphon-console-output");
    const btnCopyOutput = document.getElementById("btn-copy-output");
    
    let currentCompiledOutput = "";

    if (btnCompileSiphon) {
        btnCompileSiphon.addEventListener("click", () => {
            const rawText = rawInsightInput ? rawInsightInput.value.trim() : "";
            
            // Collect page data dynamically
            const dailyOneStepText = inputDailyOneStep ? inputDailyOneStep.value.trim() : "";
            
            const subgoals = [];
            for (let i = 1; i <= 3; i++) {
                const chk = document.getElementById(`chk-subgoal-${i}`);
                const inp = document.getElementById(`input-subgoal-${i}`);
                if (inp && inp.value.trim()) {
                    subgoals.push({
                        text: inp.value.trim(),
                        completed: chk ? chk.checked : false
                    });
                }
            }

            const activeHabits = [];
            const habitInputs = document.querySelectorAll(".col-actions .pill-text-input");
            habitInputs.forEach(input => {
                if (input.value.trim()) {
                    const container = input.closest(".pill-cb-label");
                    const cb = container ? container.querySelector("input[type='checkbox']") : null;
                    activeHabits.push({
                        text: input.value.trim(),
                        completed: cb ? cb.checked : false
                    });
                }
            });

            const progressEl = document.getElementById("action-progress-text");
            const progressText = progressEl ? progressEl.textContent : "0%";
            const vibe = siphonVibeSelect ? siphonVibeSelect.value : "relaxed";
            
            // Clean console & trigger retro compiler log sequence
            siphonConsoleOutput.innerHTML = "";
            currentCompiledOutput = "";
            btnCompileSiphon.disabled = true;
            btnCompileSiphon.textContent = "⚙️ 正在過濾並分析全篇...";
            
            const logs = [
                { text: ">>> Initializing ONESTEP Wisdom Siphoner Engine v2.5...", type: "cmd" },
                { text: "[INFO] Inspecting full-page companion database entries... [SUCCESS]", type: "info" },
                { text: `[INFO] Parsing Today's OneStep: "${dailyOneStepText || '（尚未輸入）'}"`, type: "info" },
                { text: `[INFO] Evaluating ${subgoals.length} subgoals & ${activeHabits.length} value habits...`, type: "info" },
                { text: `[SYS] Calculated Action Progress: ${progressText}. Mapping neural vibes...`, type: "success" },
                { text: `[SYS] Triggering Mentor Engine in [${vibe.toUpperCase()} MODE]...`, type: "success" },
                { text: "[WARN] Formulating deep, protective partner-mentor insights...", type: "warn" },
                { text: "[OK] Integration successful! Siphoning original interest derivative...", type: "success" }
            ];

            let logIdx = 0;
            function runLogSequence() {
                if (logIdx < logs.length) {
                    const logLine = document.createElement("div");
                    logLine.className = `console-log-line ${logs[logIdx].type}`;
                    logLine.textContent = `[${new Date().toLocaleTimeString()}] ${logs[logIdx].text}`;
                    siphonConsoleOutput.appendChild(logLine);
                    siphonConsoleOutput.scrollTop = siphonConsoleOutput.scrollHeight;
                    logIdx++;
                    setTimeout(runLogSequence, 200);
                } else {
                    // Compilation done! Render beautiful formatted summary output
                    setTimeout(renderCompiledResult, 350);
                }
            }

            runLogSequence();

            function renderCompiledResult() {
                let formattedText = "";
                
                // Templates based on vibes (Partner-Mentor tone, encouraging, structured)
                if (vibe === "relaxed") {
                    formattedText = `🌿 【INXIE 夥伴導師 · 溫暖鬆弛感智慧衍生反饋】\n\n嘿，我的夥伴！剛剛認真看完了你今天整體的生命軌跡部署，心裡覺得很踏實，也想給你最溫暖的擁抱與肯定：\n\n🎯 關於你今天的核心目標 (OneStep)：\n「${dailyOneStepText || '專注少事，尋找今天的本質核心。'}」\n這是一個非常有智慧、給自己生命本金安全感的選擇。每一步不求快，只要專注在對的地方，方向就對了。\n\n⏳ 今日支撐子目標與行動進度：\n${subgoals.map(s => ` - ${s.completed ? '✅ [已達成] ' : '🌱 [推進中] '}${s.text}`).join('\n') || ' - 今日專注於當下沉澱，少事即是多。'}\n今日行動推進率已達到了 【${progressText}】！你的每一次勾選，都是在為你的人生複利雙線注入紮實的動能。\n\n💡 今日智慧核心亮點 (Raw Insight)：\n『${rawText || '給自己留白，靜待智慧的衍生與複利。'}』\n我從中讀出了你內心的沉澱與洞察。這份筆記正是你今天產生的最棒智慧利息！我們不拿本金在外冒險，只拿利息流動。做得真的太棒了。\n\n✨ 夥伴導師悄悄話：\n「多花就會十倍回來，專注少事價值多。」別急著把一天塞滿，今天的你已經無比優秀。好好休息，我們一直在這條智慧複利的路上並肩同行。`;
                } else if (vibe === "depth") {
                    formattedText = `📚 【INXIE 夥伴導師 · 高智商哲學深度精闢反饋】\n\n謝穎 INX 夥伴戰略觀點注入：正在深度解構你今天的生命本金保護艙佈局。\n\n🔍 大局觀結構分析：\n你將今日的核心推進力錨定為：「${dailyOneStepText || '建立底盤結構，精準專注。'}」。在哲學架構中，這代表了極高優先級的能量聚焦，保護核心本金不外流。\n\n📊 行動指標與自動化防禦檢視：\n- 目前今日推進效率值：【${progressText}】\n- 規劃之關鍵行動鏈條：\n${subgoals.map(s => `   ${s.completed ? '✔ [已閉環] ' : '⏳ [架構中] '}${s.text}`).join('\n') || '   ⏳ 今日採被動打底策略，減少能耗。'}\n在重複價值事項中，你穩健推進了 ${activeHabits.filter(h => h.completed).length} 個項目。高智商的秘訣在於「專注少事」，用最少的精力摩擦獲取最大的結構槓桿。\n\n💡 智慧利息深度解耦 (Raw Insight)：\n『${rawText || '未輸入原始筆記，代表此時無聲勝有聲，保留最高心智算力。'}』\n這段話揭示了本質邏輯。我們在主客端之間建立高效濾網，不將原始核心產權曝露於雜訊中。這就是智慧本金的「防禦性增值」。\n\n🎯 夥伴導師戰略指引：\n你正在打造一個不依賴體力懸掛的「自動化護城河」。保持高度的認知清澈與防禦，利息終將萬流歸宗。你今天的每一步，都走在極具智識的軌道上！`;
                } else {
                    formattedText = `🔥 【INXIE 夥伴導師 · 正向高能創業家熱血反饋】\n\n夥伴！看完你今天的一日戰略部署，我整個人都燃起來了！這就是頂級創作者與高能行動家該有的姿態！💥\n\n🚀 今日終極衝刺焦點 (OneStep)：\n「${dailyOneStepText || '引爆今日最核心、最具價值的單一事件！'}」\n目標極度精準，直擊痛點！不廢話、不拖延，這就是極致專注的本質！\n\n⚡ 行動推進力爆表：\n我們目前的進度條已經飆到了 【${progressText}】！\n${subgoals.map(s => ` 🔥 ${s.text} -> ${s.completed ? '已攻克！這執行力太狂了！💪' : '全力推進中，勝利就在眼前！⚡'}`).join('\n') || ' 🔥 即刻鎖定少事，讓每一發行動子彈都精準打在商業價值點上！'}\n在重複價值項目中，你持續建立著高價值的日常動能。這種日拱一卒的自律，是任何人也奪不走的生命資產！\n\n💡 今日智慧金句 (Raw Insight)：\n『${rawText || '幹就對了！用行動破局！'}』\n這句話簡集是乾貨中的乾貨！這就是我們所說的「多花十倍回來，專注少事價值多」！你今天再次成功往自己的生命複利帳戶裡存入了千萬價值的本金！\n\n🌟 夥伴導師高能喊話：\n夥伴，你今天真的太棒了！不要為任何無謂的雜事、雜音浪費一絲一毫的精力。今晚，帶著這股無可阻擋的勢能，我們一起衝上高維戰略之巔！奧利給！🚀`;
                }

                currentCompiledOutput = formattedText;

                const resultWrap = document.createElement("pre");
                resultWrap.className = "compiled-output-text";
                resultWrap.textContent = formattedText;
                siphonConsoleOutput.appendChild(resultWrap);
                siphonConsoleOutput.scrollTop = siphonConsoleOutput.scrollHeight;
                
                btnCompileSiphon.disabled = false;
                btnCompileSiphon.textContent = "🚀 編譯過濾利息";
                launchToast("✨ 夥伴導師關懷與智慧利息編譯成功！");
            }
        });
    }

    // Copy to clipboard
    if (btnCopyOutput) {
        btnCopyOutput.addEventListener("click", () => {
            if (!currentCompiledOutput) {
                launchToast("⚠️ 尚未編譯任何衍生內容，無法進行複製！");
                return;
            }
            navigator.clipboard.writeText(currentCompiledOutput).then(() => {
                launchToast("📋 複製成功！您可以直接發佈到社群、電子報或客戶群囉！");
            });
        });
    }

    // --------------------------------------------------
    // 5. Interactive SVG Compounding Curves (0-80 Mini Chart)
    // --------------------------------------------------
    const miniCurveIntrinsic = document.getElementById("mini-curve-intrinsic");
    const miniCurveExtrinsic = document.getElementById("mini-curve-extrinsic");
    const sliderCompoundingAge = document.getElementById("slider-compounding-age");
    const displaySliderAge = document.getElementById("display-slider-age");
    const milestoneContentText = document.getElementById("milestone-content-text");
    // Initialize empty milestones object for any exact age (0-80)
    let milestones = {};
    const storedMilestones = localStorage.getItem("onestep-milestones");
    if (storedMilestones) {
        try {
            milestones = JSON.parse(storedMilestones);
        } catch (e) {
            console.error(e);
        }
    }

    function saveMilestones() {
        localStorage.setItem("onestep-milestones", JSON.stringify(milestones));
    }

    // Dynamic Compounding Factors loaded from localStorage with robust NaN fallback protection
    let parsedIntrinsic = parseFloat(localStorage.getItem("onestep-intrinsic-factor"));
    let intrinsicFactor = isNaN(parsedIntrinsic) ? 1.052 : parsedIntrinsic;
    let parsedExtrinsic = parseFloat(localStorage.getItem("onestep-extrinsic-factor"));
    let extrinsicFactor = isNaN(parsedExtrinsic) ? 1.055 : parsedExtrinsic;

    // Create custom tooltip div on-the-fly
    const curveTooltip = document.createElement("div");
    curveTooltip.className = "curve-tooltip";
    document.body.appendChild(curveTooltip);

    function showTooltip(e, htmlContent) {
        curveTooltip.innerHTML = htmlContent;
        curveTooltip.classList.add("active");
        positionTooltip(e);
    }

    function positionTooltip(e) {
        curveTooltip.style.left = (e.pageX + 12) + "px";
        curveTooltip.style.top = (e.pageY - 45) + "px";
    }

    function hideTooltip() {
        curveTooltip.classList.remove("active");
    }

    // Helper to calculate Y coordinates on curves (robust fallback against NaN)
    function getCurveY(age, isIntrinsic) {
        if (isIntrinsic) {
            const valIntrinsic = Math.pow(intrinsicFactor, age) * 2;
            const y = 120 - Math.min(100, isNaN(valIntrinsic) ? 2 : valIntrinsic);
            return isNaN(y) ? 115 : y;
        } else {
            const valExtrinsic = Math.pow(extrinsicFactor, age - 5) * 1.5;
            const y = 120 - Math.min(100, Math.max(0, isNaN(valExtrinsic) ? 1.5 : valExtrinsic));
            return isNaN(y) ? 117 : y;
        }
    }

    // Dynamic Milestone Dots Group
    const milestoneDotsGroup = document.getElementById("milestone-dots-group");

    function drawMilestoneDots() {
        if (!milestoneDotsGroup) return;
        milestoneDotsGroup.innerHTML = "";

        Object.keys(milestones).forEach(key => {
            const age = parseInt(key);
            const content = milestones[key];
            if (content && content.trim() !== "") {
                const x = 30 + (age / 80) * 350;
                const y = getCurveY(age, true);

                // 1. Glowing outer ring
                const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                glow.setAttribute("cx", x);
                glow.setAttribute("cy", y);
                glow.setAttribute("r", "8");
                glow.setAttribute("fill", "var(--terracotta)");
                glow.setAttribute("opacity", "0.25");
                glow.setAttribute("class", "milestone-dot-glow");
                milestoneDotsGroup.appendChild(glow);

                // 2. Solid inner dot
                const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                dot.setAttribute("cx", x);
                dot.setAttribute("cy", y);
                dot.setAttribute("r", "5");
                dot.setAttribute("fill", "var(--mustard)");
                dot.setAttribute("stroke", "var(--bg-dark)");
                dot.setAttribute("stroke-width", "1.5");
                dot.setAttribute("class", "milestone-dot");

                // Event Listeners for interactive Hover Tooltips
                dot.addEventListener("mouseenter", (e) => {
                    showTooltip(e, `🎯 <strong>${age} 歲智慧成就：</strong><br>${content}`);
                    dot.setAttribute("r", "7");
                    glow.setAttribute("r", "12");
                });
                dot.addEventListener("mousemove", (e) => {
                    positionTooltip(e);
                });
                dot.addEventListener("mouseleave", () => {
                    hideTooltip();
                    dot.setAttribute("r", "5");
                    glow.setAttribute("r", "8");
                });
                dot.addEventListener("click", () => {
                    if (sliderCompoundingAge) {
                        sliderCompoundingAge.value = age;
                        sliderCompoundingAge.dispatchEvent(new Event("input"));
                    }
                });

                milestoneDotsGroup.appendChild(dot);
            }
        });
    }

    // Interpolation mathematical curves for SVG (Compounding shape)
    function drawCompoundingCurves() {
        if (!miniCurveIntrinsic || !miniCurveExtrinsic) return;

        // Create elegant exponential Bezier curves using our adjustable factors
        let dIntrinsic = "M 30 115";
        let dExtrinsic = "M 30 117";

        for (let xVal = 30; xVal <= 380; xVal += 10) {
            const age = ((xVal - 30) / 350) * 80;
            const yIntrinsic = getCurveY(age, true);
            const yExtrinsic = getCurveY(age, false);

            dIntrinsic += ` L ${xVal} ${yIntrinsic}`;
            dExtrinsic += ` L ${xVal} ${yExtrinsic}`;
        }

        miniCurveIntrinsic.setAttribute("d", dIntrinsic);
        miniCurveExtrinsic.setAttribute("d", dExtrinsic);
    }

    // Direct Left-Click Dragging Interactive Engine on SVG Canvas
    const svgCompounding = document.getElementById("mini-compounding-svg");
    let isDraggingCurve = false;
    let activeDraggingCurve = null; // "intrinsic" or "extrinsic"
    let dragStartY = 0;
    let dragStartIntrinsicFactor = 1.052;
    let dragStartExtrinsicFactor = 1.055;

    if (svgCompounding) {
        svgCompounding.style.cursor = "ns-resize";

        svgCompounding.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return; // Only trigger on Left click
            if (e.target.classList.contains("milestone-dot")) return;

            // Get exact mouse position relative to SVG element
            const rect = svgCompounding.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Convert to 400x150 SVG viewbox coordinates
            const svgX = (mouseX / rect.width) * 400;
            const svgY = (mouseY / rect.height) * 150;

            // Convert X to age
            const age = Math.max(0, Math.min(80, ((svgX - 30) / 350) * 80));

            // Compare Y with both curves to see which is closer
            const yIntrinsic = getCurveY(age, true);
            const yExtrinsic = getCurveY(age, false);

            const distIntrinsic = Math.abs(svgY - yIntrinsic);
            const distExtrinsic = Math.abs(svgY - yExtrinsic);

            if (distIntrinsic < distExtrinsic) {
                activeDraggingCurve = "intrinsic";
                if (miniCurveIntrinsic) miniCurveIntrinsic.setAttribute("stroke-width", "5");
                if (miniCurveExtrinsic) miniCurveExtrinsic.setAttribute("opacity", "0.3");
            } else {
                activeDraggingCurve = "extrinsic";
                if (miniCurveExtrinsic) miniCurveExtrinsic.setAttribute("stroke-width", "5");
                if (miniCurveIntrinsic) miniCurveIntrinsic.setAttribute("opacity", "0.3");
            }

            isDraggingCurve = true;
            dragStartY = e.clientY;
            dragStartIntrinsicFactor = intrinsicFactor;
            dragStartExtrinsicFactor = extrinsicFactor;
            e.preventDefault();
        });

        window.addEventListener("mousemove", (e) => {
            if (!isDraggingCurve) return;

            const diffY = dragStartY - e.clientY;
            const delta = diffY * 0.00015;

            let feedbackHTML = "";

            if (activeDraggingCurve === "intrinsic") {
                intrinsicFactor = Math.max(1.01, Math.min(1.15, dragStartIntrinsicFactor + delta));
                localStorage.setItem("onestep-intrinsic-factor", intrinsicFactor);
                feedbackHTML = `🔴 <strong>調校內在複利利率：</strong><br>內在複利利率: <span class="text-gold">${((intrinsicFactor - 1) * 100).toFixed(1)}%</span>`;
            } else {
                extrinsicFactor = Math.max(1.01, Math.min(1.15, dragStartExtrinsicFactor + delta));
                localStorage.setItem("onestep-extrinsic-factor", extrinsicFactor);
                feedbackHTML = `🔵 <strong>調校外在高度利率：</strong><br>外在高度利率: <span class="text-gold">${((extrinsicFactor - 1) * 100).toFixed(1)}%</span>`;
            }

            // Redraw curves and dots instantly
            drawCompoundingCurves();
            drawMilestoneDots();

            // Render dynamic feedback tooltip at cursor position
            showTooltip(e, `⚡️ ${feedbackHTML}`);
        });

        window.addEventListener("mouseup", () => {
            if (isDraggingCurve) {
                isDraggingCurve = false;
                hideTooltip();

                // Restore styles
                if (miniCurveIntrinsic) {
                    miniCurveIntrinsic.setAttribute("stroke-width", "3");
                    miniCurveIntrinsic.setAttribute("opacity", "1.0");
                }
                if (miniCurveExtrinsic) {
                    miniCurveExtrinsic.setAttribute("stroke-width", "3");
                    miniCurveExtrinsic.setAttribute("opacity", "1.0");
                }

                launchToast(`📈 ${activeDraggingCurve === "intrinsic" ? "內在複利" : "外在高度"}增速已獨立保存於本地！`);
                activeDraggingCurve = null;
            }
        });
    }

    // Displays description of current age (direct editable inline input)
    function updateAgeMilestoneDisplay() {
        if (!sliderCompoundingAge || !displaySliderAge || !milestoneContentText) return;
        
        const age = parseInt(sliderCompoundingAge.value);
        displaySliderAge.textContent = age;

        milestoneContentText.value = milestones[age] || "";
    }

    if (sliderCompoundingAge) {
        sliderCompoundingAge.addEventListener("input", () => {
            updateAgeMilestoneDisplay();
        });
    }

    if (milestoneContentText) {
        milestoneContentText.addEventListener("input", () => {
            const age = parseInt(sliderCompoundingAge.value);
            const textVal = milestoneContentText.value.trim();
            
            if (textVal === "") {
                delete milestones[age];
            } else {
                milestones[age] = textVal;
            }
            saveMilestones();
            drawMilestoneDots(); // Redraw golden dots instantly as they type!
        });
    }

    // --------------------------------------------------
    // 6. Toast Notification & Global Boots
    // --------------------------------------------------
    function launchToast(message) {
        const toastWrap = document.getElementById("toast-notify");
        if (!toastWrap) return;
        
        const toast = document.createElement("div");
        toast.className = "toast-msg";
        toast.innerHTML = `🔔 ${message}`;
        toastWrap.appendChild(toast);
        
        // Auto remove toast elements after animation completes
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // --------------------------------------------------
    // 7. Custom Editable Labels Handler (Categories & Items)
    // --------------------------------------------------
    const customLabelInputs = document.querySelectorAll(".editable-group-title, .pill-text-input");

    function adjustInputWidth(input) {
        if (!input) return;
        const span = document.createElement("span");
        span.style.visibility = "hidden";
        span.style.position = "absolute";
        span.style.whiteSpace = "pre";
        span.style.font = window.getComputedStyle(input).font;
        span.textContent = input.value || input.placeholder || " ";
        document.body.appendChild(span);
        const textWidth = span.getBoundingClientRect().width;
        const minW = input.classList.contains('editable-group-title') ? 140 : 60;
        input.style.width = Math.max(minW, textWidth + 12) + "px";
        document.body.removeChild(span);
    }

    customLabelInputs.forEach(input => {
        const savedVal = localStorage.getItem(`onestep-custom-label-${input.id}`);
        if (savedVal !== null) {
            input.value = savedVal;
        }

        // Adjust dynamically on input
        input.addEventListener("input", () => {
            localStorage.setItem(`onestep-custom-label-${input.id}`, input.value);
            adjustInputWidth(input);
            updateProgressMetrics(); // Recalculate progress instantly when habits/items text changes!
        });
    });

    // --------------------------------------------------
    // 8. Premium Security Certificate Modal Handler
    // --------------------------------------------------
    const btnViewCert = document.getElementById("btn-view-cert");
    const certModal = document.getElementById("cert-modal");
    const btnCloseCert = document.getElementById("btn-close-cert");
    const certSessionHash = document.getElementById("cert-session-hash");

    function generateSecurityHash() {
        const salt = "INXIE-ONESTEP-PRINCIPAL-SHIELD-SALT-2026";
        const val = (document.getElementById("input-daily-onestep")?.value || "") + Date.now().toString() + salt;
        let hash = 0;
        for (let i = 0; i < val.length; i++) {
            hash = (hash << 5) - hash + val.charCodeAt(i);
            hash |= 0;
        }
        return "SEC-SHA256-" + Math.abs(hash).toString(16).toUpperCase() + "F" + (Math.abs(hash) % 999).toString() + "D7A";
    }

    if (btnViewCert && certModal) {
        btnViewCert.addEventListener("click", () => {
            if (certSessionHash) {
                certSessionHash.textContent = generateSecurityHash();
            }
            certModal.style.display = "flex";
        });
    }

    if (btnCloseCert && certModal) {
        btnCloseCert.addEventListener("click", () => {
            certModal.style.display = "none";
        });
    }

    if (certModal) {
        certModal.addEventListener("click", (e) => {
            if (e.target === certModal) {
                certModal.style.display = "none";
            }
        });
    }

    // System Startup
    checkMidnightReset();
    updateProgressMetrics();
    renderBulletins();
    drawCompoundingCurves();
    drawMilestoneDots();
    updateAgeMilestoneDisplay();

    // Adjust sizes after styles are calculated
    setTimeout(() => {
        customLabelInputs.forEach(input => adjustInputWidth(input));
    }, 100);

});
