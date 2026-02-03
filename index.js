import { chat, chat_metadata, event_types, eventSource, main_api, saveSettingsDebounced } from '../../../../script.js';
import { metadata_keys } from '../../../authors-note.js';
import { extension_settings } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { delay } from '../../../utils.js';
import { world_info_position } from '../../../world-info.js';

console.log('🟢 [STWII] Начало загрузки расширения World Info Info');

const strategy = {
    constant: '🔵',
    normal: '🟢',
    vectorized: '🔗',
};

const getStrategy = (entry)=>{
    if (entry.constant === true) {
        return 'constant';
    } else if (entry.vectorized === true) {
        return 'vectorized';
    } else {
        return 'normal';
    }
};

let generationType;
eventSource.on(event_types.GENERATION_STARTED, (genType)=>generationType = genType);

const init = ()=>{
    console.log('🟢 [STWII] Функция init() запущена');
    
    const trigger = document.createElement('div');
    trigger.classList.add('stwii--trigger');
    trigger.classList.add('fa-solid', 'fa-fw', 'fa-book-atlas');
    trigger.title = 'Active WI\n---\nright click for options';
    
    console.log('🟢 [STWII] Элемент trigger создан');
    
    // === DRAG AND DROP LOGIC ===
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let touchStartTime = 0;
    let touchMoved = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let justOpened = false;
    let touchStartedOnTrigger = false;

    // Load position with validation
    const savedPos = localStorage.getItem('stwii--trigger-position');
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            console.log('🟢 [STWII] Загруженная позиция:', pos);
            
            const leftVal = parseFloat(pos.x);
            const topVal = parseFloat(pos.y);
            
            if (!isNaN(leftVal) && !isNaN(topVal) && 
                leftVal >= 0 && leftVal < window.innerWidth - 100 &&
                topVal >= 0 && topVal < window.innerHeight - 100) {
                trigger.style.left = pos.x;
                trigger.style.top = pos.y;
                console.log('✅ [STWII] Позиция восстановлена');
            } else {
                console.log('⚠️ [STWII] Позиция невалидна, используем дефолт');
                localStorage.removeItem('stwii--trigger-position');
            }
        } catch(e) {
            console.error('🔴 [STWII] Ошибка загрузки позиции:', e);
            localStorage.removeItem('stwii--trigger-position');
        }
    }

    // Mouse events
    trigger.addEventListener('mousedown', function(e) {
        console.log('🟢 [STWII] MouseDown!');
        isDragging = true;
        const rect = trigger.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        trigger.style.opacity = '0.7';
        trigger.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        
        newX = Math.max(0, Math.min(newX, window.innerWidth - trigger.offsetWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - trigger.offsetHeight));
        
        trigger.style.left = newX + 'px';
        trigger.style.top = newY + 'px';
        
        e.preventDefault();
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            console.log('💾 [STWII] MouseUp - сохраняем позицию');
            isDragging = false;
            trigger.style.opacity = '';
            trigger.style.cursor = 'grab';
            
            const pos = {
                x: trigger.style.left,
                y: trigger.style.top
            };
            localStorage.setItem('stwii--trigger-position', JSON.stringify(pos));
            console.log('✅ [STWII] Позиция сохранена:', pos);
        }
    });

    // Touch support
    trigger.addEventListener('touchstart', function(e) {
        console.log('📱 [STWII] TouchStart!');
        touchStartTime = Date.now();
        touchMoved = false;
        touchStartedOnTrigger = true;
        
        const rect = trigger.getBoundingClientRect();
        const touch = e.touches[0];
        
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        
        offsetX = touch.clientX - rect.left;
        offsetY = touch.clientY - rect.top;
    }, {passive: true});

    document.addEventListener('touchmove', function(e) {
        if (!touchStartedOnTrigger) return;
        if (e.touches.length === 0) return;
        
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        
        if (deltaX > 10 || deltaY > 10) {
            touchMoved = true;
            isDragging = true;
            trigger.style.opacity = '0.7';
            e.preventDefault();
            
            let newX = touch.clientX - offsetX;
            let newY = touch.clientY - offsetY;
            
            newX = Math.max(0, Math.min(newX, window.innerWidth - trigger.offsetWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - trigger.offsetHeight));
            
            trigger.style.left = newX + 'px';
            trigger.style.top = newY + 'px';
        }
    }, { passive: false });

    trigger.addEventListener('touchend', function(e) {
        const touchDuration = Date.now() - touchStartTime;
        
        console.log('📱 [STWII] Trigger TouchEnd - moved:', touchMoved, 'duration:', touchDuration);
        
        if (isDragging && touchMoved) {
            isDragging = false;
            trigger.style.opacity = '';
            
            const pos = {
                x: trigger.style.left,
                y: trigger.style.top
            };
            localStorage.setItem('stwii--trigger-position', JSON.stringify(pos));
            console.log('✅ [STWII] Позиция сохранена (touch drag)');
            
            e.preventDefault();
            e.stopPropagation();
        } else if (!touchMoved && touchDuration < 300) {
            console.log('👆 [STWII] Быстрый тап - эмулируем клик');
            
            justOpened = !panel.classList.contains('stwii--isActive');
            
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            trigger.dispatchEvent(clickEvent);
            
            if (justOpened) {
                setTimeout(() => {
                    justOpened = false;
                    console.log('⏰ [STWII] justOpened сброшен');
                }, 500);
            }
            
            e.preventDefault();
            e.stopPropagation();
        }
        
        isDragging = false;
        touchMoved = false;
        touchStartedOnTrigger = false;
        touchStartX = 0;
        touchStartY = 0;
        offsetX = 0;
        offsetY = 0;
        trigger.style.opacity = '';
    }, {capture: true});

    document.body.append(trigger);
    console.log('🟢 [STWII] Trigger добавлен в body');

    const panel = document.createElement('div');
    panel.classList.add('stwii--panel');
    panel.innerHTML = '?';
    document.body.append(panel);

    const configPanel = document.createElement('div');
    configPanel.classList.add('stwii--panel');
    
    function positionPanel(panelElement) {
        const rect = trigger.getBoundingClientRect();
        const panelWidth = panelElement.offsetWidth || 250;
        const panelHeight = panelElement.offsetHeight;
        
        let left = rect.right + 10;
        let top = rect.top;
        
        if (left + panelWidth > window.innerWidth) {
            left = rect.left - panelWidth - 10;
        }
        
        if (top + panelHeight > window.innerHeight) {
            top = window.innerHeight - panelHeight - 10;
        }
        
        if (top < 0) {
            top = 10;
        }
        
        panelElement.style.left = left + 'px';
        panelElement.style.top = top + 'px';
        
        console.log('📍 [STWII] Панель позиционирована:', {left, top});
    }

    trigger.addEventListener('click', (e)=>{
        console.log('🖱️ [STWII] Click событие!');
        e.stopPropagation();
        
        configPanel.classList.remove('stwii--isActive');
        panel.classList.toggle('stwii--isActive');
        
        if (panel.classList.contains('stwii--isActive')) {
            setTimeout(() => positionPanel(panel), 10);
        }
        
        console.log('📊 [STWII] Панель теперь:', panel.classList.contains('stwii--isActive') ? 'открыта' : 'закрыта');
    });
    
    trigger.addEventListener('contextmenu', (evt)=>{
        evt.preventDefault();
        evt.stopPropagation();
        
        panel.classList.remove('stwii--isActive');
        
        configPanel.classList.toggle('stwii--isActive');
        
        if (configPanel.classList.contains('stwii--isActive')) {
            setTimeout(() => positionPanel(configPanel), 10);
        }
    });

    document.addEventListener('click', (e)=>{
        if (justOpened) {
            console.log('⏳ [STWII] Игнорируем document click - только что открыли');
            return;
        }
        
        if (!panel.contains(e.target) && 
            !configPanel.contains(e.target) && 
            !trigger.contains(e.target)) {
            
            if (panel.classList.contains('stwii--isActive') || 
                configPanel.classList.contains('stwii--isActive')) {
                console.log('❌ [STWII] Клик снаружи - закрываем панели');
                panel.classList.remove('stwii--isActive');
                configPanel.classList.remove('stwii--isActive');
            }
        }
    });

    document.addEventListener('touchend', (e)=>{
        if (justOpened) {
            console.log('⏳ [STWII] Игнорируем document touchend - только что открыли');
            return;
        }
        
        if (touchMoved) {
            console.log('⏳ [STWII] Игнорируем document touchend - было движение');
            return;
        }
        
        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        
        if (!panel.contains(target) && 
            !configPanel.contains(target) && 
            !trigger.contains(target)) {
            
            if (panel.classList.contains('stwii--isActive') || 
                configPanel.classList.contains('stwii--isActive')) {
                console.log('❌ [STWII] Touch снаружи - закрываем панели');
                panel.classList.remove('stwii--isActive');
                configPanel.classList.remove('stwii--isActive');
            }
        }
    });

    window.addEventListener('resize', () => {
        if (panel.classList.contains('stwii--isActive')) {
            positionPanel(panel);
        }
        if (configPanel.classList.contains('stwii--isActive')) {
            positionPanel(configPanel);
        }
    });

    const rowGroup = document.createElement('label');
    rowGroup.classList.add('stwii--configRow');
    rowGroup.title = 'Group entries by World Info book';
    const cbGroup = document.createElement('input');
    cbGroup.type = 'checkbox';
    cbGroup.checked = extension_settings.worldInfoInfo?.group ?? true;
    cbGroup.addEventListener('click', ()=>{
        if (!extension_settings.worldInfoInfo) {
            extension_settings.worldInfoInfo = {};
        }
        extension_settings.worldInfoInfo.group = cbGroup.checked;
        updatePanel(currentEntryList);
        saveSettingsDebounced();
    });
    rowGroup.append(cbGroup);
    const lblGroup = document.createElement('div');
    lblGroup.textContent = 'Group by book';
    rowGroup.append(lblGroup);
    configPanel.append(rowGroup);

    const orderRow = document.createElement('label');
    orderRow.classList.add('stwii--configRow');
    orderRow.title = 'Show in insertion depth / order instead of alphabetically';
    const cbOrder = document.createElement('input');
    cbOrder.type = 'checkbox';
    cbOrder.checked = extension_settings.worldInfoInfo?.order ?? true;
    cbOrder.addEventListener('click', ()=>{
        if (!extension_settings.worldInfoInfo) {
            extension_settings.worldInfoInfo = {};
        }
        extension_settings.worldInfoInfo.order = cbOrder.checked;
        updatePanel(currentEntryList);
        saveSettingsDebounced();
    });
    orderRow.append(cbOrder);
    const lblOrder = document.createElement('div');
    lblOrder.textContent = 'Show in order';
    orderRow.append(lblOrder);
    configPanel.append(orderRow);

    const mesRow = document.createElement('label');
    mesRow.classList.add('stwii--configRow');
    mesRow.title = 'Indicate message history (only when ungrouped and shown in order)';
    const cbMes = document.createElement('input');
    cbMes.type = 'checkbox';
    cbMes.checked = extension_settings.worldInfoInfo?.mes ?? true;
    cbMes.addEventListener('click', ()=>{
        if (!extension_settings.worldInfoInfo) {
            extension_settings.worldInfoInfo = {};
        }
        extension_settings.worldInfoInfo.mes = cbMes.checked;
        updatePanel(currentEntryList);
        saveSettingsDebounced();
    });
    mesRow.append(cbMes);
    const lblMes = document.createElement('div');
    lblMes.textContent = 'Show messages';
    mesRow.append(lblMes);
    configPanel.append(mesRow);

    document.body.append(configPanel);

    let entries = [];
    let count = -1;
    
    const updateBadge = async(newEntries)=>{
        if (count != newEntries.length) {
            if (newEntries.length == 0) {
                trigger.classList.add('stwii--badge-out');
                await delay(510);
                trigger.setAttribute('data-stwii--badge-count', newEntries.length.toString());
                trigger.classList.remove('stwii--badge-out');
            } else if (count == 0) {
                trigger.classList.add('stwii--badge-in');
                trigger.setAttribute('data-stwii--badge-count', newEntries.length.toString());
                await delay(510);
                trigger.classList.remove('stwii--badge-in');
            } else {
                trigger.setAttribute('data-stwii--badge-count', newEntries.length.toString());
                trigger.classList.add('stwii--badge-bounce');
                await delay(1010);
                trigger.classList.remove('stwii--badge-bounce');
            }
            count = newEntries.length;
        } else if (new Set(newEntries).difference(new Set(entries)).size > 0) {
            trigger.classList.add('stwii--badge-bounce');
            await delay(1010);
            trigger.classList.remove('stwii--badge-bounce');
        }
        entries = newEntries;
    };
    
    let currentEntryList = [];
    let currentChat = [];
    
    eventSource.on(event_types.WORLD_INFO_ACTIVATED, async(entryList)=>{
        panel.innerHTML = 'Updating...';
        updateBadge(entryList.map(it=>`${it.world}§§§${it.uid}`));
        for (const entry of entryList) {
            entry.type = 'wi';
            entry.sticky = parseInt(/**@type {string}*/(await SlashCommandParser.commands['wi-get-timed-effect'].callback(
                {
                    effect: 'sticky',
                    format: 'number',
                    file: `${entry.world}`,
                    _scope: null,
                    _abortController: null,
                },
                entry.uid,
            )));
        }
        currentEntryList = [...entryList];
        updatePanel(entryList, true);
    });

    const updatePanel = (entryList, newChat = false)=>{
        const isGrouped = extension_settings.worldInfoInfo?.group ?? true;
        const isOrdered = extension_settings.worldInfoInfo?.order ?? true;
        const isMes = extension_settings.worldInfoInfo?.mes ?? true;
        panel.innerHTML = '';
        let grouped;
        if (isGrouped) {
            grouped = Object.groupBy(entryList, (it,idx)=>it.world);
        } else {
            grouped = {'WI Entries': [...entryList]};
        }
        const depthPos = [world_info_position.ANBottom, world_info_position.ANTop, world_info_position.atDepth];
        for (const [world, entries] of Object.entries(grouped)) {
            for (const e of entries) {
                e.depth = e.position == world_info_position.atDepth ? e.depth : (chat_metadata[metadata_keys.depth] + (e.position == world_info_position.ANTop ? 0.1 : 0));
            }
            const w = document.createElement('div');
            w.classList.add('stwii--world');
            w.textContent = world;
            panel.append(w);
            entries.sort((a,b)=>{
                if (isOrdered) {
                    if (!depthPos.includes(a.position) && !depthPos.includes(b.position)) return a.position - b.position;
                    if (depthPos.includes(a.position) && !depthPos.includes(b.position)) return 1;
                    if (!depthPos.includes(a.position) && depthPos.includes(b.position)) return -1;
                    if ((a.depth ?? Number.MAX_SAFE_INTEGER) < (b.depth ?? Number.MAX_SAFE_INTEGER)) return 1;
                    if ((a.depth ?? Number.MAX_SAFE_INTEGER) > (b.depth ?? Number.MAX_SAFE_INTEGER)) return -1;
                    if ((a.order ?? Number.MAX_SAFE_INTEGER) > (b.order ?? Number.MAX_SAFE_INTEGER)) return 1;
                    if ((a.order ?? Number.MAX_SAFE_INTEGER) < (b.order ?? Number.MAX_SAFE_INTEGER)) return -1;
                    return (a.comment ?? a.key.join(', ')).toLowerCase().localeCompare((b.comment ?? b.key.join(', ')).toLowerCase());
                } else {
                    return (a.comment?.length ? a.comment : a.key.join(', ')).toLowerCase().localeCompare(b.comment?.length ? b.comment : b.key.join(', '));
                }
            });
            if (!isGrouped && isOrdered && isMes) {
                const an = chat_metadata[metadata_keys.prompt];
                const ad = chat_metadata[metadata_keys.depth];
                if (an?.length) {
                    const idx = entries.findIndex(e=>depthPos.includes(e.position) && e.depth <= ad);
                    entries.splice(idx, 0, {type: 'note', position: world_info_position.ANBottom, depth: ad, text: an});
                }
                if (newChat) {
                    currentChat = [...chat];
                    if (generationType == 'swipe') currentChat.pop();
                }
                const segmenter = new Intl.Segmenter('en', { granularity:'sentence' });
                let currentDepth = currentChat.length - 1;
                let isDumped = false;
                for (let i = entries.length - 1; i >= -1; i--) {
                    if (i < 0 && currentDepth < 0) continue;
                    if (isDumped) continue;
                    if ((i < 0 && currentDepth >= 0) || !depthPos.includes(entries[i].position)) {
                        isDumped = true;
                        const depth = -1;
                        const mesList = currentChat.slice(depth + 1, currentDepth + 1);
                        const text = mesList.map(it=>it.mes).map(it=>it.replace(/```.+```/gs, '').replace(/<[^>]+?>/g, '').trim()).filter(it=>it.length).join('\n');
                        const sentences = [...segmenter.segment(text)].map(it=>it.segment.trim());
                        entries.splice(i + 1, 0, {type: 'mes', count: mesList.length, from: depth + 1, to: currentDepth, first: sentences.at(0), last: sentences.length > 1 ? sentences.at(-1) : null});
                        currentDepth = -1;
                        continue;
                    }
                    let depth = Math.max(-1, currentChat.length - entries[i].depth - 1);
                    if (depth >= currentDepth) continue;
                    depth = Math.ceil(depth);
                    if (depth == currentDepth) continue;
                    const mesList = currentChat.slice(depth + 1, currentDepth + 1);
                    const text = mesList.map(it=>it.mes).map(it=>it.replace(/```.+```/gs, '').replace(/<[^>]+?>/g, '').trim()).filter(it=>it.length).join('\n');
                    const sentences = [...segmenter.segment(text)].map(it=>it.segment.trim());
                    entries.splice(i + 1, 0, {type: 'mes', count: mesList.length, from: depth + 1, to: currentDepth, first: sentences.at(0), last: sentences.length > 1 ? sentences.at(-1) : null});
                    currentDepth = depth;
                }
            }
            for (const entry of entries) {
                const e = document.createElement('div');
                e.classList.add('stwii--entry');
                const wipChar = [world_info_position.before, world_info_position.after];
                const wipEx = [world_info_position.EMTop, world_info_position.EMBottom];
                if (false && [...wipChar, ...wipEx].includes(entry.position)) {
                    if (main_api == 'openai') {
                        const pm = promptManager.getPromptCollection().collection;
                        if (wipChar.includes(entry.position) && !pm.find(it=>it.identifier == 'charDescription')) {
                            e.classList.add('stwii--isBroken');
                            e.title = '⚠️ Not sent because position anchor is missing (Char Description)!\n';
                        } else if (wipEx.includes(entry.position) && !pm.find(it=>it.identifier == 'dialogueExamples')) {
                            e.classList.add('stwii--isBroken');
                            e.title = '⚠️ Not sent because position anchor is missing (Example Messages)!\n';
                        }
                    }
                } else {
                    e.title = '';
                }
                if (entry.type == 'mes') e.classList.add('stwii--messages');
                if (entry.type == 'note') e.classList.add('stwii--note');
                const strat = document.createElement('div');
                strat.classList.add('stwii--strategy');
                if (entry.type == 'wi') {
                    strat.textContent = strategy[getStrategy(entry)];
                } else if (entry.type == 'mes') {
                    strat.classList.add('fa-solid', 'fa-fw', 'fa-comments');
                    strat.setAttribute('data-stwii--count', entry.count.toString());
                } else if (entry.type == 'note') {
                    strat.classList.add('fa-solid', 'fa-fw', 'fa-note-sticky');
                }
                e.append(strat);
                const title = document.createElement('div');
                title.classList.add('stwii--title');
                if (entry.type == 'wi') {
                    title.textContent = entry.comment?.length ? entry.comment : entry.key.join(', ');
                    e.title += `[${entry.world}] ${entry.comment?.length ? entry.comment : entry.key.join(', ')}\n---\n${entry.content}`;
                } else if (entry.type == 'mes') {
                    const first = document.createElement('div');
                    first.classList.add('stwii--first');
                    first.textContent = entry.first;
                    title.append(first);
                    if (entry.last) {
                        e.title = `Messages #${entry.from}-${entry.to}\n---\n${entry.first}\n...\n${entry.last}`;
                        const sep = document.createElement('div');
                        sep.classList.add('stwii--sep');
                        sep.textContent = '...';
                        title.append(sep);
                        const last = document.createElement('div');
                        last.classList.add('stwii--last');
                        last.textContent = entry.last;
                        title.append(last);
                    } else {
                        e.title = `Message #${entry.from}\n---\n${entry.first}`;
                    }
                } else if (entry.type == 'note') {
                    title.textContent = 'Author\'s Note';
                    e.title = `Author's Note\n---\n${entry.text}`;
                }
                e.append(title);
                const sticky = document.createElement('div');
                sticky.classList.add('stwii--sticky');
                sticky.textContent = entry.sticky ? `📌 ${entry.sticky}` : '';
                sticky.title = `Sticky for ${entry.sticky} more rounds`;
                e.append(sticky);
                panel.append(e);
            }
        }
    };

    const original_debug = console.debug;
    console.debug = function(...args) {
        const triggers = ['[WI] Found 0 world lore entries. Sorted by strategy', '[WI] Adding 0 entries to prompt'];
        if (triggers.includes(args[0])) {
            panel.innerHTML = 'No active entries';
            updateBadge([]);
            currentEntryList = [];
        }
        return original_debug.bind(console)(...args);
    };
    
    const original_log = console.log;
    console.log = function(...args) {
        const triggers = ['[WI] Found 0 world lore entries. Sorted by strategy', '[WI] Adding 0 entries to prompt'];
        if (triggers.includes(args[0])) {
            panel.innerHTML = 'No active entries';
            updateBadge([]);
            currentEntryList = [];
        }
        return original_log.bind(console)(...args);
    };

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ 
        name: 'wi-triggered',
        callback: (args, value)=>{
            return JSON.stringify(currentEntryList);
        },
        returns: 'list of triggered WI entries',
        helpString: 'Get the list of World Info entries triggered on the last generation.',
    }));
    
    console.log('🟢 [STWII] Расширение полностью загружено!');
};

init();
