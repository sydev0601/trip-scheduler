let selectedId = null;
let dragging = null;
let dropIndex = null;

let historyStack = [];
let historyIdx = -1;

const STORAGE_KEY = 'tripGrid.v1';

function findModule(id) {
    if (id === null) {
        return null;
    }

    for (const [i, m] of state.modules.entries()) {
        if (m.id === id) {
            // 見つかったモジュールが time, dot 以外(親)
            return { mod: m, parent: null, index: i }
        };

        const mChildIdx = (m.inline ?? []).findIndex(c => c.id === id);
        if (mChildIdx >= 0) {
            // 見つかったモジュールが time, dot (子)
            return { mod: m.inline[mChildIdx], parent: m, index: mChildIdx };
        }
    }
    return null;
}

/* ======================= */
/* ===== Module Pane ===== */
/* ======================= */
let moduleId = 2;
function onclickModuleBtn(type) {
    const selectedModule = findModule(selectedId);

    const idx = selectedModule !== null
        ? (selectedModule.parent === null
            ? selectedModule.index                         // selectedModule:親
            : findModule(selectedModule.parent.id).index)  // selectedModule:子
        : -1;   // モジュールが見つからずnullが返ってきたとき

    if (MODULE[type].inlineable && idx < 0) {
        window.alert('先に親となるモジュールを選択してください');
        return;
    }


    const insertIdx = idx >= 0 ? idx + 1 : state.modules.length;

    const newModule = {
        id: 'm' + moduleId++,
        type: type,
        props: MODULE[type].default(),
    }

    // 新しいモジュールがinlineableでないとき
    if (!MODULE[type].inlineable) {
        newModule.inline = [];
    }

    if (MODULE[type].inlineable) {
        // 子要素に同じモジュールがすでに存在したら追加せず終了
        for (const c of state.modules[idx].inline) {
            if (c.type === type) {
                window.alert('このモジュールはすでに追加されています');
                return;
            }
        };
        state.modules[idx].inline.push(newModule);
    } else {
        state.modules.splice(insertIdx, 0, newModule);
    }

    selectedId = newModule.id;

    renderViewerPane();
    renderSettingsPane();
    saveHistory();
}

function buildModulePane() {
    const MOD = [
        {
            heading: "Schedule",
            contents: [
                { type: 'scheduleHeading', icon: ICON.scheduleHeading, text: "日程見出し" },
                { type: 'heading', icon: ICON.heading, text: "見出し" },
                { type: 'duration', icon: ICON.duration, text: "所要時間" },
                { type: 'time', icon: ICON.time, text: "時刻" },
                { type: 'dot', icon: ICON.dot, text: "ドット" },
                { type: 'line', icon: ICON.line, text: "区切り線" },
            ],
        },
        {
            heading: "Transit",
            contents: [
                { type: 'transportation', icon: ICON.transportation, text: "移動" },
            ],
        },
        {
            heading: "Place",
            contents: [
                { type: 'spot', icon: ICON.spot, text: "スポット" },
                { type: 'meal', icon: ICON.meal, text: "食事" },
                { type: 'accommodation', icon: ICON.accommodation, text: "宿泊" },
                { type: 'booking', icon: ICON.booking, text: "予約・チケット" },
            ],
        },
        {
            heading: "Others",
            contents: [
                { type: 'memo', icon: ICON.memo, text: "メモ" },
                { type: 'belongings', icon: ICON.belongings, text: "持ち物" },
                { type: 'cost', icon: ICON.cost, text: "費用" },
                { type: 'weather', icon: ICON.weather, text: "天気" },
            ],
        }
    ];

    const pane = document.getElementById('module-pane');

    pane.innerHTML = MOD.map(mod => `
        <h4 class="module-subhead">${mod.heading}</h4>
        <div class="module-grid">
            ${mod.contents.map(cont => `
                <div class="module" draggable="true" data-type="${cont.type}" onclick="onclickModuleBtn('${cont.type}')">
                    <div class="icon">${cont.icon}</div>
                    <h5>${cont.text}</h5>
                </div>
            `).join('')}
        </div>
    `).join('');
}


/* ======================= */
/* ===== Viewer Pane ===== */
/* ======================= */
function onclickModule(id) {
    selectedId = id;
    renderViewerPane();
    renderSettingsPane();
}

function moduleStyle(mod) {
    return `style="--mod-line: ${mod.props.color}; --mod-selected-line: ${mod.props.selectedColor}"`
}

function calcTotalCost() {
    let totalCost = 0;

    for (const [i, m] of state.modules.entries()) {
        if (i > 0 && m.props.cost && m.type !== 'scheduleHeading') {
            totalCost += parseInt(m.props.cost);
        }
    }

    return totalCost;
}

function calcDailyCost(module) {
    const targetModule = findModule(module.id);

    let dailyCost = 0;

    for (let i = targetModule.index + 1; i < state.modules.length; i++) {
        if (state.modules[i].type === 'scheduleHeading') {
            break;
        }
        if (state.modules[i].props.cost) {
            dailyCost += parseInt(state.modules[i].props.cost);
        }
    }

    return dailyCost;
}

function countDay(module) {
    let count = 1;
    for (let i = 1; i < state.modules.length; i++) {
        if (state.modules[i].id === module.id) {
            break;
        }
        if (state.modules[i].type === 'scheduleHeading') {
            count++;
        }
    }

    return count;
}

function getStartDayEndDay() {
    let startDay = null;
    let endDay = null;

    for (const m of state.modules) {
        if (m.type === 'scheduleHeading') {
            if (startDay === null) {
                startDay = m.props.date;
            }
            endDay = m.props.date;
        }
    }

    return { start: startDay, end: endDay };
}

function convertDateFormat(date) {
    const splitedDate = date.split('-');
    const dayW = new Date(splitedDate[0], splitedDate[1] - 1, splitedDate[2]).getDay();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${splitedDate[0]}年${splitedDate[1]}月${splitedDate[2]}日(${days[dayW]})`;
}

function calcDuration(module) {
    const convertMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    };

    const start = module.type === 'duration' ? module.props.start : module.props.departure;
    const end = module.type === 'duration' ? module.props.end : module.props.arrival;

    const diffMs = Math.abs(convertMinutes(end) - convertMinutes(start));

    const hours = Math.floor(diffMs / 60);
    const minutes = Math.floor(diffMs % 60);

    return `${hours}時間 ${String(minutes).padStart(2, '0')}分`;
}

function renderModule(mod) {
    const selectedModule = (mod) => (
        mod.id === selectedId ? ' mod-selected' : ''
    );

    switch (mod.type) {
        case 'header': {
            mod.props.cost = calcTotalCost();
            const days = getStartDayEndDay();
            if (days.start !== null && days.end !== null) {
                mod.props.start = days.start;
                mod.props.end = days.end;
            }

            return `
                <div class="module-base${selectedModule(mod)}" data-type="header" data-label="ヘッダー" onclick="onclickModule('${mod.id}')" ${moduleStyle(mod)}>
                    <div class="header-module-main">
                        <div class="header-module-item">${mod.props.title}</div>
                        <div class="header-module-item">${convertDateFormat(mod.props.start)}～${convertDateFormat(mod.props.end)}</div>
                        <div class="header-module-item">&yen;${mod.props.cost}</div>
                    </div>
                </div>
            `;
        }
            break;
        case 'scheduleHeading': {
            const dailyCost = calcDailyCost(mod);
            if (dailyCost !== null) {
                mod.props.cost = dailyCost;
            }
            mod.props.dayNum = countDay(mod);

            return `
                <div class="module-base${selectedModule(mod)}" data-type="schedule-heading" data-label="日程見出し" onclick="onclickModule('${mod.id}')" ${moduleStyle(mod)}>
                    <div class="schedule-heading-module-main">
                        <div class="schedule-heading-module-item">
                            <div class="schedule-heading-day" style="--day-color:${mod.props.color}">
                                <div class="schedule-heading-d">DAY</div>
                                <div class="schedule-heading-num">${mod.props.dayNum}</div>
                            </div>
                        </div>
                        <div class="schedule-heading-module-item">${convertDateFormat(mod.props.date)}</div>
                        <div class="schedule-heading-module-item">${mod.props.title}</div>
                        <div class="schedule-heading-module-item">&yen;${mod.props.cost}</div>
                    </div>
                </div>
            `;
        }
            break;

        case 'heading': {
            return `
                <div class="module-base${selectedModule(mod)}" data-type="heading" data-label="見出し" onclick="onclickModule('${mod.id}')" ${moduleStyle(mod)}>
                    <div class="heading-module-main">${mod.props.main}</div>
                    <div class="heading-module-sub">${mod.props.sub}</div>
                </div>
            `;
        }
            break;

        case 'duration': {
            mod.props.duration = calcDuration(mod);
            return `
                <div class="module-base${selectedModule(mod)}" data-type="duration" data-label="所要時間" onclick="onclickModule('${mod.id}')" ${moduleStyle(mod)}>
                    <div class="duration-module-main">
                        <div class="duration-module-item">${mod.props.start} - ${mod.props.end}</div>
                        <div class="duration-module-item">${mod.props.duration}</div>
                        <div class="duration-module-item">${mod.props.contents}</div>
                    </div>
                </div>
            `;
        }
            break;

        case 'time': {
            return `
                <div class="module-base${selectedModule(mod)}" data-type="time" data-label="時刻" onclick="onclickModule('${mod.id}')" ${moduleStyle(mod)}>
                    <div class="time-module-main" style="--ink-color: ${mod.props.color};">${mod.props.time}</div>
                </div>
            `;
        }
            break;

        case 'dot': {
            return `
                <div class="module-base${selectedModule(mod)}" data-type="dot" data-label="ドット" onclick="onclickModule('${mod.id}')" ${moduleStyle(mod)}>
                    <div class="dot-module-main" style="--dot-color: ${mod.props.color};"></div>
                </div>
            `;
        }
            break;

        case 'line': {
            return `
                <div class="module-base${selectedModule(mod)}" data-type="line" data-label="区切り線" onclick="onclickModule('${mod.id}')" ${moduleStyle(mod)}>
                    <div class="line-module-main">
                        <hr class="h-line" style="--hr-color: ${mod.props.color};">
                    </div>
                </div>
            `;
        }
            break;

        case 'transportation': {
            mod.props.time = calcDuration(mod);
            return `
                <div class="module-base${selectedModule(mod)}" data-type="transportation" data-label="移動" onclick="onclickModule('${mod.id}')" ${moduleStyle(mod)}>
                    <div class="transportation-module-main">
                        <div class="transportation-module-grid-item">
                            <div class="icon-in-module" style="--set-icon-bg: ${mod.props.color}">${ICON[mod.props.transitIcon]}</div>
                        </div>
                        <div class="transportation-module-grid-item">${mod.props.service}</div>
                        <div class="transportation-module-grid-item">${mod.props.from}</div>
                        <div class="transportation-module-grid-item">→</div>
                        <div class="transportation-module-grid-item">${mod.props.to}</div>
                        <div class="transportation-module-grid-item">${mod.props.departure}</div>
                        <div class="transportation-module-grid-item">${mod.props.arrival}</div>
                        <div class="transportation-module-grid-item">${mod.props.time}</div>
                        <div class="transportation-module-grid-item">&yen;${mod.props.cost}</div>
                    </div>
                </div>
            `;
        }
            break;

        case 'spot': {
            return `
                <div class="module-base${selectedModule(mod)}" data-type="spot" data-label="スポット" onclick="onclickModule('${mod.id}')" ${moduleStyle(mod)}>
                    <div class="spot-module-main">
                        <div class="spot-module-item">
                            <div class="icon-in-module" style="--set-icon-bg: ${mod.props.color}">${ICON.spot}</div>
                        </div>
                        <div class="spot-module-item">${mod.props.name}</div>
                        <div class="spot-module-item">${mod.props.address}</div>
                        <div class="spot-module-item">${mod.props.hour}時間${String(mod.props.minute).padStart(2, '0')}分</div>
                        <div class="spot-module-item">${mod.props.memo}</div>
                        <div class="spot-module-item">&yen;${mod.props.cost}</div>
                    </div>
                </div>
            `;
        }
            break;

        default:
            break;
    }
}

function renderViewerPane() {
    const mods = document.getElementById('mods');

    mods.innerHTML = state.modules.map(mod => `
        <div class="viewer-row" data-row-id="${mod.id}" draggable="${mod.type !== 'header'}">
            ${mod.inline.map(inlineMod => renderModule(inlineMod)).join('')}
            ${renderModule(mod)}
        </div>
    `).join('');
}


/* ========================= */
/* ===== Settings Pane ===== */
/* ========================= */
function onclickUpBtn() {
    const selectedModule = findModule(selectedId);
    if (selectedModule === null) {
        return;
    }

    const selectedRowIdx = selectedModule.parent === null
        ? selectedModule.index                          // selectedModule:親
        : findModule(selectedModule.parent.id).index    // selectedModule:子

    // 1つ上の行
    const prevIdx = selectedRowIdx - 1;
    if (prevIdx < 0 || state.modules[prevIdx].type === 'header') {
        return;
    }

    [state.modules[prevIdx], state.modules[selectedRowIdx]] = [state.modules[selectedRowIdx], state.modules[prevIdx]];

    // 再描画
    renderViewerPane();
    renderSettingsPane();
    saveHistory();
}

function onclickDownBtn() {
    const selectedModule = findModule(selectedId);
    if (selectedModule === null) {
        return;
    }

    const selectedRowIdx = selectedModule.parent === null
        ? selectedModule.index                          // selectedModule:親
        : findModule(selectedModule.parent.id).index    // selectedModule:子

    // 1つ下の行
    const nextIdx = selectedRowIdx + 1;
    if (nextIdx > state.modules.length - 1) {
        return;
    }

    [state.modules[nextIdx], state.modules[selectedRowIdx]] = [state.modules[selectedRowIdx], state.modules[nextIdx]];

    // 再描画
    renderViewerPane();
    renderSettingsPane();
    saveHistory();
}

// 自身と子すべてに新しい id を振る
function reassignIds(mod) {
    mod.id = 'm' + moduleId++;

    // 子がある場合(プロパティ名は実際の構造に合わせてください)
    if (Array.isArray(mod.inline)) {
        mod.inline.forEach(reassignIds);
    }
}

function onclickCopyBtn() {
    const selectedModule = findModule(selectedId);
    if (selectedModule === null) {
        return;
    }

    const selectedRowIdx = selectedModule.parent === null
        ? selectedModule.index                          // selectedModule:親
        : findModule(selectedModule.parent.id).index    // selectedModule:子

    // 1つ下の行
    const nextIdx = selectedRowIdx + 1;

    const newModule = structuredClone(state.modules[selectedRowIdx]);
    reassignIds(newModule);

    state.modules.splice(nextIdx, 0, newModule);
    selectedId = newModule.id;

    // 再描画
    renderViewerPane();
    renderSettingsPane();
    saveHistory();
}

function onclickDeleteBtn() {
    const selectedModule = findModule(selectedId);
    if (selectedModule === null) {
        return;
    }

    const selectedRowIdx = selectedModule.parent === null
        ? selectedModule.index                          // selectedModule:親
        : findModule(selectedModule.parent.id).index    // selectedModule:子

    if (selectedModule.parent === null) {
        state.modules.splice(selectedRowIdx, 1);
        selectedId = state.modules[selectedRowIdx - 1].id;
    } else {
        state.modules[selectedRowIdx].inline.splice(selectedModule.index, 1);
        selectedId = state.modules[selectedRowIdx].id;
    }


    // 再描画
    renderViewerPane();
    renderSettingsPane();
    saveHistory();
}

function onchangeInputField(id, fieldKey, inputId, type) {
    const found = findModule(id);
    if (found === null) {
        return;
    }

    if (type === 'number') {
        found.mod.props[fieldKey] = parseInt(document.getElementById(inputId).value);
    } else if (fieldKey === 'hm') {
        const hm = inputId.split('_')
        if (hm[3] === 'h') {
            found.mod.props.hour = parseInt(document.getElementById(inputId).value);
        } else {
            found.mod.props.minute = parseInt(document.getElementById(inputId).value);
        }
    } else if (type === 'text') {
        const inputstr = document.getElementById(inputId).value;
        const replacedStr = inputstr.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;').replace("'", '&#39;');
        found.mod.props[fieldKey] = replacedStr;
    } else {
        found.mod.props[fieldKey] = document.getElementById(inputId).value;
    }

    renderViewerPane();
    saveHistory();
}

function onchangeTransportationIcon(id, inputId) {
    const found = findModule(id);
    if (found === null) {
        return;
    }

    found.mod.props.transitIcon = document.getElementById(inputId).value;

    renderViewerPane();
    saveHistory();
}

function onclickColorPalletBtn() {
    document.getElementById('pullDownPallets').classList.toggle('open');
}

function onclickColorPallet(id, palletId) {
    const found = findModule(id);
    if (found === null) {
        return;
    }

    found.mod.props.pallet = palletId;

    const pullDownPallets = document.getElementById('pullDownPallets');
    pullDownPallets.classList.remove('open');

    setTimeout(() => {
        renderSettingsPane();
        saveHistory();
    }, 200);
}

function onclickColorPatch(id, prop, pacthcolor) {
    const found = findModule(id);
    if (found === null) {
        return;
    }

    found.mod.props[prop] = pacthcolor;

    const pullDownPallets = document.getElementById('pullDownPallets');
    pullDownPallets.classList.remove('open');

    setTimeout(() => {
        renderSettingsPane();
        saveHistory();
    }, 200);
    renderViewerPane();
}

function renderSettingsInput(module, field) {
    const fieldId = 'f_' + module.mod.id + '_' + field.key;
    switch (field.type) {
        case 'text':
        case 'date':
        case 'time':
            return `
                <div class="module-field-item">
                <div class="module-field-label">${field.label}</div>
                    <input id="${fieldId}" type="${field.type}" value="${module.mod.props[field.key]}" ${field.type === 'number' ? 'min="0"' : ''} onchange="onchangeInputField('${module.mod.id}', '${field.key}', '${fieldId}', '${field.type}')">
                </div>
            `;
            break;

        case 'number':
            return `
                <div class="module-field-item">
                    <div class="module-field-label">${field.label}</div>
                    <div class="input-cost-outer">
                        <input id="${fieldId}" class="input-cost" type="${field.type}" value="${module.mod.props[field.key]}" ${field.type === 'number' ? 'min="0"' : ''} onchange="onchangeInputField('${module.mod.id}', '${field.key}', '${fieldId}', '${field.type}')">
                        <div class="unit-label">円</div>
                    </div>
                </div>
            `;
            break;

        case 'transportation_icon':
            const transportations = [
                { id: 'transit_icon_walk', value: 'walk' },
                { id: 'transit_icon_bicycle', value: 'bicycle' },
                { id: 'transit_icon_car', value: 'car' },
                { id: 'transit_icon_taxi', value: 'taxi' },
                { id: 'transit_icon_bus', value: 'bus' },
                { id: 'transit_icon_train', value: 'train' },
                { id: 'transit_icon_shinkanseh', value: 'shinkansen' },
                { id: 'transit_icon_plane', value: 'plane' },
                { id: 'transit_icon_ship', value: 'ship' },
            ];

            return ` 
                <div class="transportation_radio_grid"> 
                    ${transportations.map(t => `
                        <label class="transportation_radio_label">
                            <input id="${t.id}" type="radio" name="transportation_icon" class="transportation_radio" onchange="onchangeTransportationIcon('${module.mod.id}', '${t.id}')" value="${t.value}" ${module.mod.props.transitIcon === t.value ? 'checked' : ''} >
                            <div class="transportation_radio_icon">${ICON[t.value]}</div>
                        </label>
                    `).join('')}
                </div>
            `;
            break;

        case 'textarea':
            return `
                <div class="textarea module-field-item">
                    <div class="module-field-label">${field.label}</div>
                    <textarea id="${fieldId}" rows="4" cols="30" onchange="onchangeInputField('${module.mod.id}', '${field.key}', '${fieldId}', '${field.type}')">${module.mod.props.memo}</textarea>
                </div>
            `;
            break;

        case 'color':
            const pallets = [
                ['#F8C8D4', '#F6D2B8', '#F7E3A1', '#CFE3B4', '#B7DCD3', '#BCCBEA', '#D9C3E6'],
                ['#C9A9A6', '#CDB59A', '#CFC6A0', '#A9B89A', '#9DB4AE', '#9FADBF', '#B1A4BC'],
                ['#8C3B4A', '#B5653A', '#B89B3E', '#5E7F4F', '#2F6F73', '#3E5A8C', '#6B4F86'],
                ['#F28C6B', '#E5707E', '#C9648F', '#A25E9E', '#7F63A8', '#5F67A8', '#486A9C'],
                ['#FF6B6B', '#FF9F43', '#FECA57', '#2ED573', '#1ABC9C', '#3D9BFF', '#A55EEA'],
                ['#CFEFF2', '#A5DDE5', '#78C6D6', '#4FA9C4', '#3A86B0', '#2C6694', '#234B78'],
                ['#C8DC7A', '#A4CC72', '#7FB86C', '#5BA26A', '#418A66', '#2F7364', '#235C5A'],
            ];

            return `
                <div class="module-field-item color-field">
                    <div class="module-field-label">${field.label}</div>
                    <div id="selectColorOuter" class="select-color-outer">
                        <button id="palletPullDownBtn" class="pallet-pull-down-btn" onclick="onclickColorPalletBtn()">${ICON.right}</button>
                        <div class="pallet">
                            ${pallets[module.mod.props.pallet].map(c => `
                                <button class="color-patch-btn ${module.mod.props.color === c ? 'selected' : ''}" style="--patch-color: ${c};" onclick="onclickColorPatch('${module.mod.id}', '${field.key}', '${c}')"></button>
                            `).join('')}
                        </div>
                        <div id="pullDownPallets" class="pull-down-pallets">
                        ${pallets.map((p, i) => `
                            <div class="pallet-btn ${module.mod.props.pallet === i ? 'selected' : ''}" onclick="onclickColorPallet('${module.mod.id}', ${i})">
                            ${p.map(c => `
                                <div class="color-patch" style="--patch-color: ${c};"></div>
                            `).join('')}
                            </div>
                        `).join('')}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'hm':
            return `
                <div class="module-field-item">
                    <div class="module-field-label">${field.label}</div>
                    <div class="hm-outer">
                        <input id="${fieldId}_h" class="hm-input" type="number" value="${module.mod.props.hour}" min="0" onchange="onchangeInputField('${module.mod.id}', '${field.key}', '${fieldId}_h', '${field.type}')">
                        <div class="unit-label">時間</div>
                        <input id="${fieldId}_m" class="hm-input" type="number" value="${module.mod.props.minute}" min="0" max="59" onchange="onchangeInputField('${module.mod.id}', '${field.key}', '${fieldId}_m', '${field.type}')">
                        <div class="unit-label">分</div>
                    </div>
                </div>
            `;
            break;

        default:
            break;
    }
}

function renderSettingsPane() {
    const selectedModule = findModule(selectedId);
    const settingsPane = document.getElementById('settingsPane');

    settingsPane.innerHTML = '';
    let html = '';

    if (selectedModule === null) {
        html = `
            <div class="unselected">
            各モジュールの設定や、<br>詳細情報を確認することができます
            <br>
            モジュールを選択してください
            </div>
        `;
        settingsPane.innerHTML += html;
        return;
    } else {
        html = `
            <div class="module-info-grid">
            <div class="module-info-item">${MODULE[selectedModule.mod.type].icon}</div>
            <div class="module-info-item">${MODULE[selectedModule.mod.type].name}</div>
            <div class="module-info-item">${MODULE[selectedModule.mod.type].description}</div>
            </div>
        `;
    }

    if (selectedModule.mod.type !== 'header') {
        html += `
            <div class="module-edit-buttons-grid">
            <button class="module-edit-buttons-item" onclick="onclickUpBtn()">${ICON.up}</button>
            <button class="module-edit-buttons-item" onclick="onclickDownBtn()">${ICON.down}</button>
            <button class="module-edit-buttons-item" onclick="onclickCopyBtn()">${ICON.copy}</button>
            <button class="module-edit-buttons-item" onclick="onclickDeleteBtn()">${ICON.delete}</button>
            </div>
        `;
    }

    html += `
        <div class="module-field-grid">
            ${(MODULE[selectedModule.mod.type].fields ?? []).map(f => renderSettingsInput(selectedModule, f)).join('')}
        </div>
    `;

    settingsPane.innerHTML += html;
}

/* ====================== */
/* ===== bottom bar ===== */
/* ====================== */
function saveHistory() {
    const snapshot = JSON.stringify(state);
    if (historyStack[historyIdx] === snapshot) {
        return;
    }

    historyStack = historyStack.slice(0, historyIdx + 1);
    historyStack.push(snapshot);
    historyIdx = historyStack.length - 1;

    if (historyStack.length > 100) {
        historyStack.shift();
        historyIdx--;
    }

    updateHistoryButtons();
    saveToStorage();
}

function restoreHistory() {
    Object.assign(state, JSON.parse(historyStack[historyIdx]));
    if (findModule(selectedId) === null) {
        // 選択中のモジュールが消えたら選択解除
        selectedId = null;
    }
    renderViewerPane();
    renderSettingsPane();
    updateHistoryButtons();
    saveToStorage();
}

function undo() {
    if (historyIdx <= 0) {
        return;
    }
    historyIdx--;
    restoreHistory();
}

function redo() {
    if (historyIdx >= historyStack.length - 1) {
        return;
    }
    historyIdx++;
    restoreHistory();
}

function updateHistoryButtons() {
    const u = document.getElementById('undoBtn');
    const r = document.getElementById('redoBtn');
    if (u) {
        u.disabled = historyIdx <= 0;
    }
    if (r) {
        r.disabled = historyIdx >= historyStack.length - 1;
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            state: state,
            moduleId: moduleId,
        }));
    } catch (e) {
        console.warn('保存できませんでした', e);
    }
}

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return false;
        }
        const data = JSON.parse(raw);
        Object.assign(state, data.state);
        moduleId = data.moduleId;
        return true;
    } catch (e) {
        console.warn('読み込めませんでした', e);
        return false;
    }
}

function allClear() {
    if (!confirm('ヘッダーを初期化し，その他すべてのモジュールを削除します。よろしいですか？')) {
        return;
    }

    state.modules.splice(1);   // 1番目だけ残して、2番目以降をすべて削除
    selectedId = null;
    const init = MODULE.header.default();
    state.modules[0].props.start = init.start;
    state.modules[0].props.end = init.end;
    state.modules[0].props.title = init.title;

    saveHistory();
    renderViewerPane();
    renderSettingsPane();
}

async function saveAsImage() {
    const target = document.getElementById('mods');

    // 選択枠やドロップ位置の線が写り込まないようにする
    document.body.classList.add('exporting');
    clearIndicator();

    try {
        const pixelRatio = 2;
        const margin = 16 * pixelRatio;   // 余白 16px 分（画像の解像度に合わせる）
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--center-bg').trim();

        const shot = await htmlToImage.toCanvas(target, { pixelRatio });

        // 余白付きのキャンバスを作って、背景色で塗り、撮った画像を中央に貼る
        const out = document.createElement('canvas');
        out.width = shot.width + margin * 2;
        out.height = shot.height + margin * 2;

        const ctx = out.getContext('2d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(shot, margin, margin);

        const a = document.createElement('a');
        a.href = out.toDataURL('image/png');
        a.download = 'itinerary.png';
        a.click();
    } catch (e) {
        console.error('画像の保存に失敗しました', e);
    } finally {
        document.body.classList.remove('exporting');
    }
}

function buildBottomBar() {
    const buttons = [
        { id: 'undoBtn', icon: ICON.back, onclick: 'undo()' },
        { id: 'redoBtn', icon: ICON.forword, onclick: 'redo()' },
        { id: 'saveAsImgBtn', icon: ICON.saveAsImg, onclick: 'saveAsImage()' },
        { id: 'allClearBtn', icon: ICON.allClear, onclick: 'allClear()' },
    ];

    document.getElementById('bottomBar').innerHTML = `
        ${buttons.map(b =>
        `<button id="${b.id}" onclick="${b.onclick}">${b.icon}</button>`
    ).join('')}
    `;
}

/* ================== */
/* ===== window ===== */
/* ================== */
function calcDropIndex(clientY) {
    const rows = [...document.querySelectorAll('#mods > .viewer-row')];
    let idx = rows.length;
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) {
            idx = i; break;
        }
    }
    return Math.max(1, idx);
}

function mainModuleEl(row) {
    // 行の中の「本体」: time / dot 以外の .module-base
    return row.querySelector('.module-base:not([data-type="time"]):not([data-type="dot"])');
}

function showIndicator(idx) {
    clearIndicator();
    const rows = document.querySelectorAll('#mods > .viewer-row');
    if (rows.length === 0) {
        return;
    }

    if (idx < rows.length) {
        mainModuleEl(rows[idx])?.classList.add('drop-before');
    } else {
        mainModuleEl(rows[rows.length - 1])?.classList.add('drop-after');
    }
}

function clearIndicator() {
    document.querySelectorAll('.drop-before, .drop-after, .drop-target').forEach(el => {
        el.classList.remove('drop-before', 'drop-after', 'drop-target')
    });
}

function createModule(type) {
    const m = { id: 'm' + moduleId++, type, props: MODULE[type].default() };
    if (!MODULE[type].inlineable) {
        m.inline = [];
    }
    return m;
}

function moveRow(id, to) {
    const from = state.modules.findIndex(m => m.id === id);
    if (from < 0) return;

    if (to > from) to--;          // 取り出すと、後ろの添字が1つ詰まるため
    if (to === from) return;      // 動かない

    const [moved] = state.modules.splice(from, 1);
    state.modules.splice(to, 0, moved);
}

function buildWindow() {
    loadFromStorage();
    saveHistory();
    buildModulePane();
    renderViewerPane();
    renderSettingsPane();
    buildBottomBar();

    const centerPane = document.getElementById('centerPane');
    centerPane.addEventListener('click', (e) => {
        if (e.target.closest('.module-base') || selectedId === null) {
            return;
        }

        selectedId = null;
        renderViewerPane();
        renderSettingsPane();
    });

    // モジュールテンプレートをドラッグ開始
    document.getElementById('module-pane').addEventListener('dragstart', (e) => {
        const el = e.target.closest('.module');
        if (!el) {
            return;
        }
        dragging = { kind: 'new', type: el.dataset.type };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', el.dataset.type);
    });

    const mods = document.getElementById('mods');
    // 既存モジュールをドラッグ開始
    mods.addEventListener('dragstart', (e) => {
        const row = e.target.closest('.viewer-row');
        if (!row) return;
        dragging = { kind: 'move', id: row.dataset.rowId };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.rowId);
        row.classList.add('dragging');
    });

    // ドラッグ中のモジュールを，既存モジュールに重ねたとき
    centerPane.addEventListener('dragover', (e) => {
        if (dragging === null) return;

        // time / dot：行の上に落とす
        if (dragging.kind === 'new' && MODULE[dragging.type].inlineable) {
            clearIndicator();
            const rowEl = e.target.closest('.viewer-row');
            const parent = rowEl && state.modules.find(m => m.id === rowEl.dataset.rowId);
            if (!parent || parent.inline.some(c => c.type === dragging.type)) {
                dropIndex = null;
                return;                           // preventDefault しない → 落とせない
            }
            e.preventDefault();
            dropIndex = null;
            dragging.targetId = parent.id;        // どの行に付けるか覚えておく
            rowEl.classList.add('drop-target');   // ※専用のクラス（outline など）を作ってもよい
            return;
        }

        e.preventDefault();
        dropIndex = calcDropIndex(e.clientY);
        showIndicator(dropIndex);
    });

    centerPane.addEventListener('dragleave', (e) => {
        if (!centerPane.contains(e.relatedTarget)) {
            clearIndicator();
        }
    });

    centerPane.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragging === null) return;                    // ① 何も運んでいない

        if (dragging.kind === 'new' && MODULE[dragging.type].inlineable) {
            // time/dot：行の子として付ける
            const parent = state.modules.find(m => m.id === dragging.targetId);
            if (!parent) return;
            const m = createModule(dragging.type);
            parent.inline.push(m);
            selectedId = m.id;

        } else if (dropIndex === null) {
            return;                                       // 挿入位置が決まっていない

        } else if (dragging.kind === 'new') {
            // 新しい行を、dropIndex の位置に挿入
            const m = createModule(dragging.type);
            state.modules.splice(dropIndex, 0, m);
            selectedId = m.id;

        } else {
            // 既存の行を移動
            moveRow(dragging.id, dropIndex);
        }

        // 共通の後処理（return しなかった枝は、必ずここを通る）
        clearIndicator();
        saveHistory();
        renderViewerPane();
        renderSettingsPane();
    });

    document.addEventListener('dragend', () => {
        dragging = null;
        dropIndex = null;
        clearIndicator();
        document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('#selectColorOuter')) {
            return;
        }
        document.getElementById('pullDownPallets')?.classList.remove('open');
    });

    document.addEventListener('keydown', (e) => {
        // 入力欄ではブラウザ標準の取り消しに任せる
        if (e.target.matches('input, textarea, select')) {
            return;
        }
        if (!(e.ctrlKey || e.metaKey)) {
            return;
        }
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        else if (key === 'y' || (key === 'z' && e.shiftKey)) {
            e.preventDefault();
            redo();
        }
    });
}
buildWindow();