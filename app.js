// --- State ---
let cardsData = [];
let pokemonNamesData = [];
let filteredSuggestions = [];
let selectedIndex = -1;
let cardsDataLoadError = false;

// --- DOM Elements ---
const searchInput = document.getElementById('searchInput');
const suggestionList = document.getElementById('suggestionList');
const statusMessage = document.getElementById('statusMessage');
const outputInput = document.getElementById('outputInput');
const copyButton = document.getElementById('copyButton');

// --- Initialization ---
async function init() {
    // data/cards.json の読み込み
    try {
        const response = await fetch('data/cards.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        cardsData = await response.json();
        
        if (!cardsData || cardsData.length === 0) {
            cardsDataLoadError = true;
            showStatus('カードデータがありません', 'error');
        }
    } catch (error) {
        console.error('Failed to load cards:', error);
        cardsDataLoadError = true;
        showStatus('カードデータを読み込めませんでした。ローカルサーバーが立ち上がっているか確認してください。', 'error');
    }

    // data/pokemon_names.json の読み込み
    try {
        const pokeRes = await fetch('data/pokemon_names.json');
        if (!pokeRes.ok) {
            throw new Error(`HTTP error! status: ${pokeRes.status}`);
        }
        pokemonNamesData = await pokeRes.json();
    } catch (error) {
        console.warn('pokemon_names.json を読み込めませんでした。ポケモン名候補なしで続行します。');
    }

    setupEventListeners();
}

// --- Logic: Normalization ---
function normalizeString(str) {
    if (!str) return '';
    return str
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .toLowerCase()
        .replace(/　/g, ' ')
        .replace(/／/g, '/');
}

function katakanaToHiragana(str) {
    return str.replace(/[\u30a1-\u30f6]/g, function(match) {
        var chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
    });
}

function normalizeText(str) {
    if (!str) return '';
    let normalized = str
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/／/g, '/')
        .toLowerCase()
        .replace(/　/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return katakanaToHiragana(normalized);
}

// --- Logic: Query Parsing ---
function parseQueryParts(query) {
    const normalizedQuery = normalizeText(query);
    
    // 英数字・記号と日本語（非ASCII）の間にスペースを挿入し、分離しやすくする
    const spacedText = normalizedQuery
        .replace(/([^\x00-\x7F])([a-z0-9\/]+)/g, '$1 $2')
        .replace(/([a-z0-9\/]+)([^\x00-\x7F])/g, '$1 $2');

    let remainingText = spacedText;
    let collectorNumber = null;
    let setCode = null;

    // コレクター番号抽出: \d{1,3}/\d{1,3}
    const cnMatch = remainingText.match(/\d{1,3}\/\d{1,3}/);
    if (cnMatch) {
        let parts = cnMatch[0].split('/');
        collectorNumber = `${parts[0].padStart(3, '0')}/${parts[1].padStart(3, '0')}`;
        remainingText = remainingText.replace(cnMatch[0], ' ');
    }

    // セットコード抽出
    const words = remainingText.split(/\s+/).filter(w => w.length > 0);
    let newWords = [];
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (!setCode && /^[a-z]{1,4}\d{0,3}[a-z]?$/.test(word)) {
            const hasNumber = /\d/.test(word);
            const existsInCards = cardsData.some(c => (c.set_code || '').toLowerCase() === word);
            if (hasNumber || existsInCards) {
                setCode = word;
                continue;
            }
        }
        newWords.push(word);
    }
    
    remainingText = newWords.join(' ').trim();

    return {
        normalizedQuery,
        spacedText,
        remainingText,
        collectorNumber,
        setCode
    };
}

// --- Logic: Pokemon Name Search ---
function searchPokemonNames(query, parsedParts) {
    if (!pokemonNamesData || pokemonNamesData.length === 0) return [];
    if (!parsedParts.remainingText) return [];

    const searchTerms = parsedParts.remainingText.split(/\s+/).filter(t => t.length > 0);
    if (searchTerms.length === 0) return [];

    const scoredPokemon = pokemonNamesData.map(pokemon => {
        let isMatchAll = true;
        let score = 0;
        let matchedTermCount = 0;
        let localExtraParts = [];

        const nameJa = normalizeText(pokemon.name_ja);
        const nameEn = normalizeText(pokemon.name_en || '');
        const keywords = (pokemon.search_keywords || []).map(k => normalizeText(k));
        
        const targets = keywords.length > 0 ? keywords : [nameJa, nameEn].filter(Boolean);

        for (const term of searchTerms) {
            let termMatched = false;
            let maxTermScore = 0;

            if (nameJa === term) maxTermScore = Math.max(maxTermScore, 100);
            if (nameJa.startsWith(term)) maxTermScore = Math.max(maxTermScore, 80);
            
            for (const target of targets) {
                if (target === term) maxTermScore = Math.max(maxTermScore, 50);
                else if (target.startsWith(term)) maxTermScore = Math.max(maxTermScore, 30);
                else if (target.includes(term)) maxTermScore = Math.max(maxTermScore, 10);
            }

            if (maxTermScore > 0) {
                termMatched = true;
                score += maxTermScore;
                matchedTermCount++;
            } else {
                // 英数字・記号のみの場合は、検索を落とさずに余剰パーツとして扱う
                if (/^[a-z0-9\/]+$/.test(term)) {
                    localExtraParts.push(term);
                } else {
                    isMatchAll = false;
                    break;
                }
            }
        }

        // 少なくとも1つの単語がポケモン名にマッチしている必要がある
        if (isMatchAll && matchedTermCount > 0) {
            return { pokemon, score, localExtraParts };
        }
        return null;
    }).filter(item => item !== null);

    scoredPokemon.sort((a, b) => b.score - a.score || a.pokemon.id - b.pokemon.id);
    return scoredPokemon.slice(0, 10);
}

function buildPokemonSuggestion(pokemon, parsedParts, localExtraParts = []) {
    const pokemonSuggestion = {
        type: 'pokemon',
        text: `【ポケモン名】${pokemon.name_ja}`,
        output: pokemon.name_ja,
        raw: pokemon
    };

    let withPartsSuggestion = null;
    
    const parts = [
        parsedParts.setCode,
        parsedParts.collectorNumber,
        ...localExtraParts
    ].filter(Boolean);

    if (parts.length > 0) {
        const outputText = [pokemon.name_ja, ...parts].join(' ');
        withPartsSuggestion = {
            type: 'pokemon_with_parts',
            text: `【入力補正】${outputText}`,
            output: outputText,
            raw: pokemon
        };
    }

    return { pokemonSuggestion, withPartsSuggestion };
}

// --- Logic: Card Search (Original) ---
function searchCards(query, cards) {
    if (!query.trim()) return [];

    const normalizedQuery = normalizeString(query);
    const searchTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);

    const scoredCards = cards.map(card => {
        let score = 0;
        let isMatchAll = true;

        const normalizedFields = {
            card_name: normalizeString(card.card_name),
            set_code: normalizeString(card.set_code),
            collector_number: normalizeString(card.collector_number),
            rarity: normalizeString(card.rarity),
            set_name: normalizeString(card.set_name || ''),
            keywords: (card.keywords || []).map(k => normalizeString(k)).join(' ')
        };

        // カタカナ・ひらがなの揺れ吸収のため、カード名もひらがな化して判定追加
        const hiraganaCardName = katakanaToHiragana(normalizedFields.card_name);

        for (let term of searchTerms) {
            let termMatched = false;
            let maxTermScore = 0;
            const hiraTerm = katakanaToHiragana(term);

            if (normalizedFields.set_code === term) maxTermScore = Math.max(maxTermScore, 100);
            if (normalizedFields.collector_number === term) maxTermScore = Math.max(maxTermScore, 100);
            if (normalizedFields.card_name === term || hiraganaCardName === hiraTerm) maxTermScore = Math.max(maxTermScore, 100);
            
            if (normalizedFields.card_name.startsWith(term) || hiraganaCardName.startsWith(hiraTerm)) maxTermScore = Math.max(maxTermScore, 50);
            if (normalizedFields.collector_number.includes(term)) maxTermScore = Math.max(maxTermScore, 50);
            if ((card.keywords || []).some(k => normalizeString(k) === term)) maxTermScore = Math.max(maxTermScore, 50);

            if (normalizedFields.card_name.includes(term) || hiraganaCardName.includes(hiraTerm)) maxTermScore = Math.max(maxTermScore, 10);
            if (normalizedFields.set_name.includes(term)) maxTermScore = Math.max(maxTermScore, 10);
            if (normalizedFields.keywords.includes(term)) maxTermScore = Math.max(maxTermScore, 10);
            if (normalizedFields.rarity === term || normalizedFields.rarity.includes(term)) maxTermScore = Math.max(maxTermScore, 10);

            if (maxTermScore > 0) {
                termMatched = true;
                score += maxTermScore;
            }

            if (!termMatched) {
                isMatchAll = false;
                break;
            }
        }

        return isMatchAll ? { card, score } : null;
    }).filter(item => item !== null);

    scoredCards.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.card.set_code !== b.card.set_code) return (a.card.set_code || '').localeCompare(b.card.set_code || '');
        if (a.card.collector_number !== b.card.collector_number) return (a.card.collector_number || '').localeCompare(b.card.collector_number || '');
        return (a.card.card_name || '').localeCompare(b.card.card_name || '');
    });

    return scoredCards.map(item => item.card).slice(0, 20);
}

// --- Logic: Search Integration ---
function mergeResults(pokemonResults, cardResults, parsedParts) {
    let suggestions = [];

    let allPokemonSuggestions = [];
    let allWithPartsSuggestions = [];

    pokemonResults.forEach(result => {
        const { pokemon, localExtraParts } = result;
        const { pokemonSuggestion, withPartsSuggestion } = buildPokemonSuggestion(pokemon, parsedParts, localExtraParts);
        allPokemonSuggestions.push(pokemonSuggestion);
        if (withPartsSuggestion) {
            allWithPartsSuggestions.push(withPartsSuggestion);
        }
    });

    let mappedCardResults = cardResults.map(card => {
        const parts = [card.card_name, card.set_code, card.collector_number, card.rarity].filter(part => part && part.trim() !== '');
        return {
            type: 'card',
            text: `【カード】${parts.join(' ')}`,
            output: parts.join(' '),
            raw: card
        };
    });

    const hasParts = allWithPartsSuggestions.length > 0;

    if (!hasParts) {
        suggestions = [...allPokemonSuggestions, ...mappedCardResults];
    } else {
        suggestions = [...allWithPartsSuggestions, ...allPokemonSuggestions, ...mappedCardResults];
    }

    return suggestions.slice(0, 20);
}

function searchAll(query) {
    if (!query.trim()) return [];

    const parsedParts = parseQueryParts(query);
    const pokemonResults = searchPokemonNames(query, parsedParts);
    // cards.json側の検索にもスペース分離済みのテキストを渡し、くっついた入力でもヒットしやすくする
    const cardResults = searchCards(parsedParts.spacedText, cardsData);

    return mergeResults(pokemonResults, cardResults, parsedParts);
}

// --- UI Updates ---
function showStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message ' + type;
}

function renderSuggestions(suggestions) {
    suggestionList.innerHTML = '';
    
    if (suggestions.length === 0) {
        suggestionList.classList.remove('active');
        if (searchInput.value.trim().length > 0) {
            showStatus('候補がありません');
        } else {
            showStatus('');
        }
        return;
    }

    showStatus('');
    suggestionList.classList.add('active');

    suggestions.forEach((suggestion, index) => {
        const li = document.createElement('li');
        li.textContent = suggestion.text;
        
        if (suggestion.type === 'pokemon') {
            li.classList.add('suggestion-pokemon');
        } else if (suggestion.type === 'pokemon_with_parts') {
            li.classList.add('suggestion-pokemon-with-parts');
        } else if (suggestion.type === 'card') {
            li.classList.add('suggestion-card');
        }

        if (index === selectedIndex) {
            li.classList.add('selected');
        }

        li.addEventListener('click', () => {
            selectSuggestion(index);
        });

        suggestionList.appendChild(li);
    });
}

function selectSuggestion(index) {
    if (index < 0 || index >= filteredSuggestions.length) return;
    
    const suggestion = filteredSuggestions[index];
    outputInput.value = suggestion.output;
    
    suggestionList.classList.remove('active');
    searchInput.focus();
}

// --- Event Listeners ---
function setupEventListeners() {
    searchInput.addEventListener('input', (e) => {
        // カードデータがなくてもポケモン名検索が動くように、エラーチェックを緩和
        const query = e.target.value;
        filteredSuggestions = searchAll(query);
        selectedIndex = -1;
        renderSuggestions(filteredSuggestions);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (!suggestionList.classList.contains('active') && e.key !== 'Enter') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, filteredSuggestions.length - 1);
            renderSuggestions(filteredSuggestions);
            scrollToSelected();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderSuggestions(filteredSuggestions);
            scrollToSelected();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < filteredSuggestions.length) {
                selectSuggestion(selectedIndex);
            } else if (filteredSuggestions.length > 0) {
                selectSuggestion(0);
            }
        } else if (e.key === 'Escape') {
            suggestionList.classList.remove('active');
            selectedIndex = -1;
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-section') && !e.target.closest('.results-section')) {
            suggestionList.classList.remove('active');
        }
    });

    copyButton.addEventListener('click', async () => {
        const textToCopy = outputInput.value;
        if (!textToCopy) return;

        try {
            await navigator.clipboard.writeText(textToCopy);
            showStatus('コピーしました', 'success');
            setTimeout(() => {
                if (statusMessage.textContent === 'コピーしました') {
                    showStatus('');
                }
            }, 3000);
        } catch (err) {
            console.error('Copy failed:', err);
            try {
                outputInput.select();
                document.execCommand('copy');
                showStatus('コピーしました', 'success');
                setTimeout(() => {
                    if (statusMessage.textContent === 'コピーしました') {
                        showStatus('');
                    }
                }, 3000);
            } catch (fallbackErr) {
                showStatus('コピーできませんでした。文字列を選択して手動でコピーしてください。', 'error');
            }
        }
    });
}

function scrollToSelected() {
    const selectedItem = suggestionList.querySelector('.selected');
    if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
    }
}

// --- Start ---
document.addEventListener('DOMContentLoaded', init);
