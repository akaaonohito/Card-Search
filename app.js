// --- State ---
let cardsData = [];
let filteredCards = [];
let selectedIndex = -1;
let dataLoadError = false;

// --- DOM Elements ---
const searchInput = document.getElementById('searchInput');
const suggestionList = document.getElementById('suggestionList');
const statusMessage = document.getElementById('statusMessage');
const outputInput = document.getElementById('outputInput');
const copyButton = document.getElementById('copyButton');

// --- Initialization ---
async function init() {
    try {
        const response = await fetch('data/cards.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        cardsData = await response.json();
        
        if (!cardsData || cardsData.length === 0) {
            dataLoadError = true;
            showStatus('カードデータがありません', 'error');
        }
    } catch (error) {
        console.error('Failed to load cards:', error);
        dataLoadError = true;
        showStatus('カードデータを読み込めませんでした。ローカルファイルとして直接開いている場合は、サーバーを立ち上げる必要があります。', 'error');
    }

    setupEventListeners();
}

// --- Logic: Normalization ---
function normalizeString(str) {
    if (!str) return '';
    return str
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // 全角英数字を半角に
        .toLowerCase() // 小文字化
        .replace(/　/g, ' ') // 全角スペースを半角スペースに
        .replace(/／/g, '/'); // 全角スラッシュを半角スラッシュに
}

// --- Logic: Search ---
function searchCards(query, cards) {
    if (!query.trim()) {
        return [];
    }

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

        for (const term of searchTerms) {
            let termMatched = false;
            let maxTermScore = 0;

            // 強い一致
            if (normalizedFields.set_code === term) maxTermScore = Math.max(maxTermScore, 100);
            if (normalizedFields.collector_number === term) maxTermScore = Math.max(maxTermScore, 100);
            if (normalizedFields.card_name === term) maxTermScore = Math.max(maxTermScore, 100);
            
            // 中程度の一致
            if (normalizedFields.card_name.startsWith(term)) maxTermScore = Math.max(maxTermScore, 50);
            if (normalizedFields.collector_number.includes(term)) maxTermScore = Math.max(maxTermScore, 50);
            if ((card.keywords || []).some(k => normalizeString(k) === term)) maxTermScore = Math.max(maxTermScore, 50);

            // 弱い一致
            if (normalizedFields.card_name.includes(term)) maxTermScore = Math.max(maxTermScore, 10);
            if (normalizedFields.set_name.includes(term)) maxTermScore = Math.max(maxTermScore, 10);
            if (normalizedFields.keywords.includes(term)) maxTermScore = Math.max(maxTermScore, 10);
            if (normalizedFields.rarity === term || normalizedFields.rarity.includes(term)) maxTermScore = Math.max(maxTermScore, 10);

            if (maxTermScore > 0) {
                termMatched = true;
                score += maxTermScore;
            }

            if (!termMatched) {
                isMatchAll = false;
                break; // 1つでも一致しない単語があれば、このカードは除外
            }
        }

        return isMatchAll ? { card, score } : null;
    }).filter(item => item !== null);

    // ソート
    scoredCards.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score; // スコア降順
        }
        // スコアが同じ場合は set_code -> collector_number -> card_name 昇順
        if (a.card.set_code !== b.card.set_code) {
            return (a.card.set_code || '').localeCompare(b.card.set_code || '');
        }
        if (a.card.collector_number !== b.card.collector_number) {
            return (a.card.collector_number || '').localeCompare(b.card.collector_number || '');
        }
        return (a.card.card_name || '').localeCompare(b.card.card_name || '');
    });

    return scoredCards.map(item => item.card).slice(0, 20); // 最大20件
}

// --- Logic: Output Formatting ---
function formatCardOutput(card) {
    const parts = [
        card.card_name,
        card.set_code,
        card.collector_number,
        card.rarity
    ].filter(part => part && part.trim() !== ''); // 空欄を除外

    return parts.join(' ');
}

// --- UI Updates ---
function showStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message ' + type;
}

function renderSuggestions(cards) {
    suggestionList.innerHTML = '';
    
    if (cards.length === 0) {
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

    cards.forEach((card, index) => {
        const li = document.createElement('li');
        li.textContent = `${card.card_name} ${card.set_code} ${card.collector_number} ${card.rarity || ''}`.trim();
        if (index === selectedIndex) {
            li.classList.add('selected');
        }

        li.addEventListener('click', () => {
            selectCard(index);
        });

        suggestionList.appendChild(li);
    });
}

function selectCard(index) {
    if (index < 0 || index >= filteredCards.length) return;
    
    const card = filteredCards[index];
    outputInput.value = formatCardOutput(card);
    
    // 候補を閉じる
    suggestionList.classList.remove('active');
    searchInput.focus();
}

// --- Event Listeners ---
function setupEventListeners() {
    searchInput.addEventListener('input', (e) => {
        if (dataLoadError) return; // データ読み込みエラー時は検索しない
        const query = e.target.value;
        filteredCards = searchCards(query, cardsData);
        selectedIndex = -1; // 検索結果が変わったら選択をリセット
        renderSuggestions(filteredCards);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (!suggestionList.classList.contains('active') && e.key !== 'Enter') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, filteredCards.length - 1);
            renderSuggestions(filteredCards);
            scrollToSelected();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0); // -1には戻さない（一番上で止まる）
            renderSuggestions(filteredCards);
            scrollToSelected();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < filteredCards.length) {
                selectCard(selectedIndex);
            } else if (filteredCards.length > 0) {
                // 何も選択されていない状態でEnterを押したら1件目を選択する
                selectCard(0);
            }
        } else if (e.key === 'Escape') {
            suggestionList.classList.remove('active');
            selectedIndex = -1;
        }
    });
    
    // 他の場所をクリックしたら候補を閉じる
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
            // 代替のコピー方法（古いブラウザ対応）
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
