// Global state
let currentPage = 'main';
let currentSearchQuery = '';
let currentChannelId = null;
let selectedRating = 0;
let isAdminLoggedIn = false;
let selectedTags = [];
let currentAdminTab = 'channels';
let currentUser = null;
let sessionToken = null;

// Telegram WebApp Integration
// Telegram Widget Authentication
function onTelegramAuth(user) {
    console.log('Telegram authentication successful:', user);
    
    // Store user data
    currentUser = user;
    
    // Create session token (simple approach for now)
    sessionToken = generateSessionToken();
    localStorage.setItem('session_token', sessionToken);
    
    // Send user data to server
    authenticateWithTelegramWidget(user);
    
    // Update UI
    updateAuthUI();
    
    // Close modal
    closeLoginModal();
    
    showSuccess('Успешный вход через Telegram!');
}

// Generate simple session token
function generateSessionToken() {
    return 'tg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Authenticate with Telegram Widget data
async function authenticateWithTelegramWidget(user) {
    try {
        const response = await fetch('/api/telegram/widget-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                user: user,
                sessionToken: sessionToken
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('Server authentication successful:', result);
            // Force UI update after successful authentication
            setTimeout(() => {
                updateAuthUI();
            }, 100);
        } else {
            console.error('Server authentication failed:', result.error);
        }
    } catch (error) {
        console.error('Error authenticating with server:', error);
    }
}

// Get session token from localStorage
function getSessionToken() {
    if (!sessionToken) {
        sessionToken = localStorage.getItem('session_token');
    }
    return sessionToken;
}

// Check if user is authenticated
function isUserAuthenticated() {
    return currentUser !== null && sessionToken !== null;
}

// Update UI based on authentication status
function updateAuthUI() {
    console.log('updateAuthUI called, currentUser:', currentUser, 'sessionToken:', sessionToken);
    
    const loginBtn = document.getElementById('loginBtn');
    const userStatus = document.getElementById('userStatus');
    const userName = document.getElementById('userName');
    
    if (isUserAuthenticated()) {
        console.log('User is authenticated, updating UI...');
        // User is logged in
        loginBtn.style.display = 'none';
        userStatus.classList.remove('hidden');
        userName.textContent = currentUser.first_name + (currentUser.last_name ? ' ' + currentUser.last_name : '');
        
        // Enable auth-required elements
        document.querySelectorAll('.auth-required').forEach(el => {
            el.classList.remove('auth-required');
        });
    } else {
        console.log('User is not authenticated, showing login button...');
        // User is not logged in
        loginBtn.style.display = 'flex';
        userStatus.classList.add('hidden');
        
        // Disable auth-required elements
        document.querySelectorAll('.secondary-button').forEach(btn => {
            if (btn.textContent.includes('Добавить канал') || btn.textContent.includes('Оставить отзыв')) {
                btn.classList.add('auth-required');
            }
        });
    }
}

// Show login modal
function showLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

// Close login modal
function closeLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
}

// Login with Telegram (now just shows modal with widget)
function loginWithTelegram() {
    showLoginModal();
}

// Logout user
function logoutUser() {
    currentUser = null;
    sessionToken = null;
    localStorage.removeItem('session_token');
    updateAuthUI();
    showSuccess('Вы вышли из аккаунта');
}

// Check authentication before performing actions
function requireAuth(action) {
    if (!isUserAuthenticated()) {
        showLoginModal();
        return false;
    }
    return true;
}

// Page navigation functions
function showMainPage() {
    hideAllPages();
    document.querySelector('.container').style.display = 'block';
    document.body.classList.add('main-page');
    currentPage = 'main';
}

function showSearchPage() {
    hideAllPages();
    document.getElementById('searchPage').classList.remove('hidden');
    currentPage = 'search';
    loadSearchResults();
}

function showAddChannelPage() {
    if (!requireAuth()) return;
    
    hideAllPages();
    document.getElementById('addChannelPage').classList.remove('hidden');
    currentPage = 'addChannel';
    loadTags();
}

function showChannelDetails(channelId) {
    hideAllPages();
    document.getElementById('channelDetailsPage').classList.remove('hidden');
    currentPage = 'channelDetails';
    currentChannelId = channelId;
    loadChannelDetails(channelId);
}

function hideAllPages() {
    document.querySelector('.container').style.display = 'none';
    document.getElementById('searchPage').classList.add('hidden');
    document.getElementById('addChannelPage').classList.add('hidden');
    document.getElementById('channelDetailsPage').classList.add('hidden');
    document.getElementById('adminPanelPage').classList.add('hidden');
    document.body.classList.remove('main-page');
}

// Enhanced main search functionality
async function performMainSearch() {
    const searchInput = document.getElementById('mainSearchInput');
    const query = searchInput.value.trim();
    currentSearchQuery = query;
    
    if (!query) {
        hideMainSearchResults();
        return;
    }
    
    try {
        // Show loading state
        const resultsContainer = document.getElementById('mainSearchResults');
        const resultsList = document.getElementById('mainResultsList');
        const resultsCount = document.getElementById('mainResultsCount');
        
        resultsCount.textContent = 'Поиск...';
        resultsList.innerHTML = '<div class="loading">Ищем каналы и теги...</div>';
        resultsContainer.classList.remove('hidden');
        
        // Search channels, tags, and channels by tag
        const [channelsResponse, tagsResponse, channelsByTagResponse] = await Promise.all([
            fetch(`/api/channels/search?q=${encodeURIComponent(query)}`),
            fetch(`/api/tags/search?q=${encodeURIComponent(query)}`),
            fetch(`/api/channels/by-tag?tag=${encodeURIComponent(query)}`)
        ]);
        
        const channels = await channelsResponse.json();
        const tags = await tagsResponse.json();
        const channelsByTag = await channelsByTagResponse.json();
        
        // Combine channels and remove duplicates
        const allChannels = [...channels, ...channelsByTag];
        const uniqueChannels = allChannels.filter((channel, index, self) => 
            index === self.findIndex(c => c.id === channel.id)
        );
        
        displayMainSearchResults(uniqueChannels, tags, query);
    } catch (error) {
        console.error('Error searching:', error);
        showError('Ошибка поиска');
    }
}

function displayMainSearchResults(channels, tags, query) {
    const resultsContainer = document.getElementById('mainSearchResults');
    const resultsList = document.getElementById('mainResultsList');
    const resultsCount = document.getElementById('mainResultsCount');
    
    const totalResults = channels.length + tags.length;
    resultsCount.textContent = `Найдено: ${channels.length} каналов, ${tags.length} тегов`;
    
    if (totalResults === 0) {
        resultsList.innerHTML = `
            <div class="no-results">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <p>По запросу "${escapeHtml(query)}" ничего не найдено</p>
                <span>Попробуйте изменить запрос или использовать другие слова</span>
            </div>
        `;
    } else {
        let html = '';
        
        // Display tags first
        if (tags.length > 0) {
            html += `
                <div class="search-section">
                    <h4 class="search-section-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                            <line x1="7" y1="7" x2="7.01" y2="7"></line>
                        </svg>
                        Теги (${tags.length})
                    </h4>
                    <div class="tags-results">
                        ${tags.map(tag => `
                            <div class="tag-result" onclick="searchByTag('${escapeHtml(tag.name)}')">
                                <span class="tag-name">${escapeHtml(tag.name)}</span>
                                <span class="tag-count">${tag.channel_count} каналов</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Display channels
        if (channels.length > 0) {
            html += `
                <div class="search-section">
                    <h4 class="search-section-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        Каналы (${channels.length})
                    </h4>
                    <div class="channels-results">
                        ${channels.map(channel => `
                            <div class="result-card">
                                <div class="channel-header">
                                    <div class="channel-name">${escapeHtml(channel.title)}</div>
                                    <div class="channel-rating">
                                        <div class="stars">${channel.stars}</div>
                                        <span class="rating-value">${channel.avg_rating}/5</span>
                                    </div>
                                </div>
                                <div class="channel-description">${escapeHtml(channel.description)}</div>
                                ${channel.tags && channel.tags.length > 0 ? `
                                    <div class="channel-tags">
                                        ${channel.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                                    </div>
                                ` : ''}
                                <button class="details-button" onclick="showChannelDetails(${channel.id})">
                                    Подробнее
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        resultsList.innerHTML = html;
    }
    
    resultsContainer.classList.remove('hidden');
}

function hideMainSearchResults() {
    const resultsContainer = document.getElementById('mainSearchResults');
    resultsContainer.classList.add('hidden');
}

// Show random channel
async function showRandomChannel() {
    try {
        // Show loading state
        const resultsContainer = document.getElementById('mainSearchResults');
        const resultsList = document.getElementById('mainResultsList');
        const resultsCount = document.getElementById('mainResultsCount');
        
        resultsCount.textContent = 'Поиск случайного кф...';
        resultsList.innerHTML = '<div class="loading">Выбираем случайный кф...</div>';
        resultsContainer.classList.remove('hidden');
        
        // Get random channel
        const response = await fetch('/api/channels/random');
        const channel = await response.json();
        
        if (response.ok) {
            // Show the random channel
            resultsCount.textContent = 'Случайный кф';
            resultsList.innerHTML = `
                <div class="search-section">
                    <h4 class="search-section-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="1,4 1,10 7,10"></polyline>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                        Случайный кф
                    </h4>
                    <div class="channels-results">
                        <div class="result-card">
                            <div class="channel-header">
                                <div class="channel-name">${escapeHtml(channel.title)}</div>
                                <div class="channel-rating">
                                    <div class="stars">${channel.stars}</div>
                                    <span class="rating-value">${channel.avg_rating}/5</span>
                                </div>
                            </div>
                            <div class="channel-description">${escapeHtml(channel.description)}</div>
                            ${channel.tags && channel.tags.length > 0 ? `
                                <div class="channel-tags">
                                    ${channel.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                                </div>
                            ` : ''}
                            <button class="details-button" onclick="showChannelDetails(${channel.id})">
                                Подробнее
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            resultsCount.textContent = 'Ошибка';
            resultsList.innerHTML = `
                <div class="no-results">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <p>Не удалось найти случайный кф</p>
                    <span>Попробуйте еще раз</span>
                </div>
            `;
        }
        
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Error getting random channel:', error);
        showError('Ошибка получения случайного кф');
    }
}

// Search by tag function
async function searchByTag(tagName) {
    try {
        // Show loading state
        const resultsContainer = document.getElementById('mainSearchResults');
        const resultsList = document.getElementById('mainResultsList');
        const resultsCount = document.getElementById('mainResultsCount');
        
        resultsCount.textContent = 'Поиск...';
        resultsList.innerHTML = '<div class="loading">Ищем каналы по тегу...</div>';
        resultsContainer.classList.remove('hidden');
        
        // Search channels by tag
        const response = await fetch(`/api/channels/by-tag?tag=${encodeURIComponent(tagName)}`);
        const channels = await response.json();
        
        // Display results
        resultsCount.textContent = `Найдено: ${channels.length} каналов по тегу "${tagName}"`;
        
        if (channels.length === 0) {
            resultsList.innerHTML = `
                <div class="no-results">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                        <line x1="7" y1="7" x2="7.01" y2="7"></line>
                    </svg>
                    <p>По тегу "${escapeHtml(tagName)}" каналы не найдены</p>
                </div>
            `;
        } else {
            resultsList.innerHTML = `
                <div class="search-section">
                    <h4 class="search-section-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        Каналы с тегом "${escapeHtml(tagName)}" (${channels.length})
                    </h4>
                    <div class="channels-results">
                        ${channels.map(channel => `
                            <div class="result-card">
                                <div class="channel-header">
                                    <div class="channel-name">${escapeHtml(channel.title)}</div>
                                    <div class="channel-rating">
                                        <div class="stars">${channel.stars}</div>
                                        <span class="rating-value">${channel.avg_rating}/5</span>
                                    </div>
                                </div>
                                <div class="channel-description">${escapeHtml(channel.description)}</div>
                                ${channel.tags && channel.tags.length > 0 ? `
                                    <div class="channel-tags">
                                        ${channel.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                                    </div>
                                ` : ''}
                                <button class="details-button" onclick="showChannelDetails(${channel.id})">
                                    Подробнее
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Error searching by tag:', error);
        showError('Ошибка поиска по тегу');
    }
}

// Legacy search functionality (for separate search page)
async function loadSearchResults() {
    try {
        const response = await fetch('/api/channels');
        const channels = await response.json();
        displaySearchResults(channels);
    } catch (error) {
        console.error('Error loading channels:', error);
        showError('Ошибка загрузки каналов');
    }
}

async function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    currentSearchQuery = query;
    
    if (!query) {
        loadSearchResults();
        return;
    }
    
    try {
        const response = await fetch(`/api/channels/search?q=${encodeURIComponent(query)}`);
        const channels = await response.json();
        displaySearchResults(channels);
    } catch (error) {
        console.error('Error searching channels:', error);
        showError('Ошибка поиска');
    }
}

function displaySearchResults(channels) {
    const resultsContainer = document.getElementById('searchResults');
    const resultsCount = document.getElementById('resultsCount');
    
    resultsCount.textContent = `Показано - ${channels.length} результатов`;
    
    if (channels.length === 0) {
        resultsContainer.innerHTML = '<div class="loading">Каналы не найдены</div>';
        return;
    }
    
    resultsContainer.innerHTML = channels.map(channel => `
        <div class="result-card">
            <div class="channel-name">${escapeHtml(channel.title)}</div>
            <div class="channel-description">${escapeHtml(channel.description)}</div>
            <div class="rating-section">
                <span class="rating-label">Рейтинг:</span>
                <div class="stars">${channel.stars}</div>
                <span class="rating-text">(${channel.avg_rating}/5)</span>
            </div>
            <button class="details-button" onclick="showChannelDetails(${channel.id})">
                Подробнее
            </button>
        </div>
    `).join('');
}

// Channel details functionality
async function loadChannelDetails(channelId) {
    try {
        const response = await fetch(`/api/channels/${channelId}`);
        const channel = await response.json();
        displayChannelDetails(channel);
    } catch (error) {
        console.error('Error loading channel details:', error);
        showError('Ошибка загрузки деталей канала');
    }
}

function displayChannelDetails(channel) {
    const detailsContainer = document.getElementById('channelDetails');
    
    detailsContainer.innerHTML = `
        <div class="detail-card">
            <h2 class="detail-title">${escapeHtml(channel.title)}</h2>
            <p class="detail-description">${escapeHtml(channel.description)}</p>
            <a href="${channel.link}" target="_blank" class="detail-link">
                Перейти в канал
            </a>
            <div class="detail-rating">
                <span class="rating-label">Рейтинг:</span>
                <div class="stars">${channel.stars}</div>
                <span class="rating-text">(${channel.avg_rating}/5)</span>
            </div>
        </div>
        
        <div class="reviews-section">
            <h3 class="reviews-title">Отзывы (${channel.review_count})</h3>
            <div id="reviewsList">
                ${channel.reviews.map(review => `
                    <div class="review-card">
                        <div class="review-header">
                            <span class="review-nickname">
                                ${review.is_anonymous ? 'Анонимно' : (review.nickname || 'Пользователь')}
                            </span>
                            <span class="review-date">${formatDate(review.created_at)}</span>
                        </div>
                        <div class="review-rating">
                            ${generateStarsHTML(review.rating)}
                        </div>
                        <p class="review-text">${escapeHtml(review.text)}</p>
                    </div>
                `).join('')}
            </div>
            
            <div class="add-review-form">
                <h4 class="add-review-title">Добавить отзыв</h4>
                <form id="addReviewForm">
                    <div class="review-form-group">
                        <label>Оценка:</label>
                        <div class="rating-input">
                            ${[1,2,3,4,5].map(i => `
                                <button type="button" class="rating-star" data-rating="${i}" onclick="setRating(${i})">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                    </svg>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="review-form-group">
                        <label for="reviewText">Текст отзыва:</label>
                        <textarea id="reviewText" class="form-textarea" placeholder="Оставьте свой отзыв..." required></textarea>
                    </div>
                    
                    <div class="review-form-group">
                        <p class="user-info-display" id="userInfoDisplay">
                            Отзыв будет добавлен от вашего имени в Telegram
                        </p>
                    </div>
                    
                    <button type="submit" class="submit-button">Добавить отзыв</button>
                </form>
            </div>
        </div>
    `;
    
    // Add form submit handler
    document.getElementById('addReviewForm').addEventListener('submit', handleAddReview);
}

// Add channel functionality
async function loadTags() {
    try {
        const response = await fetch('/api/tags');
        const tags = await response.json();
        displayTags(tags);
    } catch (error) {
        console.error('Error loading tags:', error);
    }
}

function displayTags(tags) {
    const tagsSelect = document.getElementById('channelTags');
    tagsSelect.innerHTML = '<option value="">Выберите теги</option>' +
        tags.map(tag => `<option value="${tag.id}">${escapeHtml(tag.name)}</option>`).join('');
}

// Form handlers
document.getElementById('addChannelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!requireAuth()) return;
    
    const formData = new FormData(e.target);
    const channelData = {
        title: document.getElementById('channelName').value,
        description: document.getElementById('channelDescription').value,
        link: document.getElementById('channelLink').value,
        tags: Array.from(document.getElementById('channelTags').selectedOptions).map(option => option.value).filter(v => v)
    };
    
    try {
        const response = await fetch('/api/channels', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(channelData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            e.target.reset();
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding channel:', error);
        showError('Ошибка добавления канала');
    }
});

async function handleAddReview(e) {
    e.preventDefault();
    
    if (!requireAuth()) return;
    
    if (selectedRating === 0) {
        showError('Пожалуйста, выберите оценку');
        return;
    }
    
    const reviewData = {
        text: document.getElementById('reviewText').value,
        rating: selectedRating
    };
    
    try {
        const response = await fetch(`/api/channels/${currentChannelId}/reviews`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(reviewData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            e.target.reset();
            selectedRating = 0;
            updateRatingStars();
            // Reload channel details to show new review
            loadChannelDetails(currentChannelId);
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding review:', error);
        showError('Ошибка добавления отзыва');
    }
}

// Rating functionality
function setRating(rating) {
    selectedRating = rating;
    updateRatingStars();
}

function updateRatingStars() {
    const stars = document.querySelectorAll('.rating-star');
    stars.forEach((star, index) => {
        if (index < selectedRating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function generateStarsHTML(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    let stars = '';
    for (let i = 0; i < fullStars; i++) {
        stars += '<svg class="star" width="14" height="14" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#fbbf24"/></svg>';
    }
    if (hasHalfStar) {
        stars += '<svg class="star half" width="14" height="14" viewBox="0 0 24 24"><defs><linearGradient id="half-star"><stop offset="50%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#4b5563"/></linearGradient></defs><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#half-star)"/></svg>';
    }
    for (let i = 0; i < emptyStars; i++) {
        stars += '<svg class="star" width="14" height="14" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#4b5563"/></svg>';
    }
    return stars;
}

function showError(message) {
    showMessage(message, 'error');
}

function showSuccess(message) {
    showMessage(message, 'success');
}

function showMessage(message, type) {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.error, .success');
    existingMessages.forEach(msg => msg.remove());
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = type;
    messageDiv.textContent = message;
    
    // Insert at the top of the current page
    const currentPageElement = document.querySelector('.page:not(.hidden)') || document.querySelector('.container');
    currentPageElement.insertBefore(messageDiv, currentPageElement.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
}

// Search input event listeners
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// Main search input event listeners
document.getElementById('mainSearchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performMainSearch();
    }
});

document.getElementById('mainSearchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length > 2) {
        performMainSearch();
    } else if (query.length === 0) {
        hideMainSearchResults();
    }
});

// Admin panel placeholder
function showAdminPanel() {
    // Show admin panel page first
    hideAllPages();
    document.getElementById('adminPanelPage').classList.remove('hidden');
    currentPage = 'adminPanel';
    
    // Always show login form first, hide dashboard completely
    document.getElementById('adminLoginForm').style.display = 'block';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    
    // Clear any previous login attempts
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminPassword').value = '';
    
    // Reset admin login state
    isAdminLoggedIn = false;
}

// Admin Panel Functions
async function handleAdminLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            isAdminLoggedIn = true;
            // Hide login form and show dashboard ONLY after successful login
            document.getElementById('adminLoginForm').style.display = 'none';
            document.getElementById('adminDashboard').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'block';
            loadAdminContent();
            showSuccess('Успешный вход в админ-панель');
        } else {
            showError(result.error);
            // Keep login form visible on error, ensure dashboard is hidden
            document.getElementById('adminLoginForm').style.display = 'block';
            document.getElementById('adminDashboard').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'none';
            isAdminLoggedIn = false;
        }
    } catch (error) {
        console.error('Error logging in:', error);
        showError('Ошибка входа в админ-панель');
        // Keep login form visible on error, ensure dashboard is hidden
        document.getElementById('adminLoginForm').style.display = 'block';
        document.getElementById('adminDashboard').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
        isAdminLoggedIn = false;
    }
}

function logoutAdmin() {
    isAdminLoggedIn = false;
    document.getElementById('adminLoginForm').style.display = 'block';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    showSuccess('Вы вышли из админ-панели');
}

async function loadAdminContent() {
    // Check if admin is logged in
    if (!isAdminLoggedIn) {
        showError('Необходима авторизация');
        return;
    }
    await showAdminTab(currentAdminTab);
}

function showAdminTab(tab) {
    currentAdminTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Load content based on tab
    switch(tab) {
        case 'channels':
            loadAdminChannels();
            break;
        case 'reviews':
            loadAdminReviews();
            break;
        case 'tags':
            loadAdminTags();
            break;
        case 'users':
            loadAdminUsers();
            break;
        case 'statistics':
            loadAdminStatistics();
            break;
        case 'admins':
            loadAdminAdmins();
            break;
    }
}

async function loadAdminChannels() {
    try {
        const response = await fetch('/api/admin/channels');
        const channels = await response.json();
        displayAdminChannels(channels);
    } catch (error) {
        console.error('Error loading admin channels:', error);
        showError('Ошибка загрузки каналов');
    }
}

function displayAdminChannels(channels) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = channels.map(channel => `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">${escapeHtml(channel.title)}</div>
                <div class="admin-item-details">${escapeHtml(channel.description)}</div>
                <div class="admin-item-details">Ссылка: ${escapeHtml(channel.link)}</div>
                <div class="admin-item-details">Создан: ${formatDate(channel.created_at)}</div>
                ${channel.first_name ? `
                    <div class="admin-item-details">
                        Пользователь: ${channel.first_name} ${channel.last_name || ''} 
                        ${channel.username ? `(@${channel.username})` : ''}
                        ${channel.telegram_id ? `[ID: ${channel.telegram_id}]` : ''}
                    </div>
                ` : '<div class="admin-item-details">Пользователь: Анонимный</div>'}
                <span class="admin-item-status ${channel.status}">${channel.status}</span>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn edit" onclick="editChannel(${channel.id})" title="Редактировать">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="admin-action-btn approve" onclick="approveChannel(${channel.id})" title="Одобрить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                </button>
                <button class="admin-action-btn delete" onclick="deleteChannel(${channel.id})" title="Удалить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function loadAdminReviews() {
    try {
        const response = await fetch('/api/admin/reviews');
        const reviews = await response.json();
        displayAdminReviews(reviews);
    } catch (error) {
        console.error('Error loading admin reviews:', error);
        showError('Ошибка загрузки отзывов');
    }
}

function displayAdminReviews(reviews) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = reviews.map(review => `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">Отзыв #${review.id}</div>
                <div class="admin-item-details">Канал: ${escapeHtml(review.channel_title)}</div>
                <div class="admin-item-details">Автор: ${review.nickname || 'Анонимный пользователь'}</div>
                ${review.first_name ? `
                    <div class="admin-item-details">
                        Telegram: ${review.first_name} ${review.last_name || ''} 
                        ${review.username ? `(@${review.username})` : ''}
                        ${review.telegram_id ? `[ID: ${review.telegram_id}]` : ''}
                    </div>
                ` : ''}
                <div class="admin-item-details">Рейтинг: ${review.rating}/5</div>
                <div class="admin-item-details">Текст: ${escapeHtml(review.text)}</div>
                <div class="admin-item-details">Создан: ${formatDate(review.created_at)}</div>
                <span class="admin-item-status ${review.status}">${review.status}</span>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn approve" onclick="approveReview(${review.id})" title="Одобрить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                </button>
                <button class="admin-action-btn delete" onclick="deleteReview(${review.id})" title="Удалить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function loadAdminTags() {
    try {
        const response = await fetch('/api/admin/tags');
        const tags = await response.json();
        displayAdminTags(tags);
    } catch (error) {
        console.error('Error loading admin tags:', error);
        showError('Ошибка загрузки тегов');
    }
}

function displayAdminTags(tags) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">Управление тегами</div>
                <div class="admin-item-details">Всего тегов: ${tags.length}</div>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn approve" onclick="openAddTagModal()" title="Добавить тег">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>
        </div>
    ` + tags.map(tag => `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">${escapeHtml(tag.name)}</div>
                <div class="admin-item-details">ID: ${tag.id}</div>
                <span class="admin-item-status ${tag.status}">${tag.status}</span>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn edit" onclick="editTag(${tag.id})" title="Редактировать">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="admin-action-btn delete" onclick="deleteTag(${tag.id})" title="Удалить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function performAdminSearch() {
    const query = document.getElementById('adminSearchInput').value.trim();
    
    if (!query) {
        loadAdminContent();
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        displayAdminSearchResults(results);
    } catch (error) {
        console.error('Error performing admin search:', error);
        showError('Ошибка поиска');
    }
}

function displayAdminSearchResults(results) {
    const content = document.getElementById('adminContent');
    
    let html = '<div class="admin-item"><div class="admin-item-info"><div class="admin-item-title">Результаты поиска</div><div class="admin-item-details">Найдено: ' + results.length + ' результатов</div></div></div>';
    
    results.forEach(item => {
        if (item.type === 'channel') {
            html += `
                <div class="admin-item">
                    <div class="admin-item-info">
                        <div class="admin-item-title">Канал: ${escapeHtml(item.title)}</div>
                        <div class="admin-item-details">${escapeHtml(item.description)}</div>
                        <span class="admin-item-status ${item.status}">${item.status}</span>
                    </div>
                    <div class="admin-item-actions">
                        <button class="admin-action-btn edit" onclick="editChannel(${item.id})" title="Редактировать">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="admin-action-btn delete" onclick="deleteChannel(${item.id})" title="Удалить">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"></polyline>
                                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }
    });
    
    content.innerHTML = html;
}

// Admin Actions
async function approveChannel(channelId) {
    try {
        const response = await fetch(`/api/admin/channels/${channelId}/approve`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showSuccess('Канал одобрен');
            loadAdminChannels();
        } else {
            showError('Ошибка одобрения канала');
        }
    } catch (error) {
        console.error('Error approving channel:', error);
        showError('Ошибка одобрения канала');
    }
}

async function deleteChannel(channelId) {
    if (!confirm('Вы уверены, что хотите удалить этот канал?')) return;
    
    try {
        const response = await fetch(`/api/admin/channels/${channelId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showSuccess('Канал удален');
            loadAdminChannels();
        } else {
            showError('Ошибка удаления канала');
        }
    } catch (error) {
        console.error('Error deleting channel:', error);
        showError('Ошибка удаления канала');
    }
}

async function approveReview(reviewId) {
    try {
        const response = await fetch(`/api/admin/reviews/${reviewId}/approve`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showSuccess('Отзыв одобрен');
            loadAdminReviews();
        } else {
            showError('Ошибка одобрения отзыва');
        }
    } catch (error) {
        console.error('Error approving review:', error);
        showError('Ошибка одобрения отзыва');
    }
}

async function deleteReview(reviewId) {
    if (!confirm('Вы уверены, что хотите удалить этот отзыв?')) return;
    
    try {
        const response = await fetch(`/api/admin/reviews/${reviewId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showSuccess('Отзыв удален');
            loadAdminReviews();
        } else {
            showError('Ошибка удаления отзыва');
        }
    } catch (error) {
        console.error('Error deleting review:', error);
        showError('Ошибка удаления отзыва');
    }
}

async function deleteTag(tagId) {
    if (!confirm('Вы уверены, что хотите удалить этот тег?')) return;
    
    try {
        const response = await fetch(`/api/admin/tags/${tagId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showSuccess('Тег удален');
            loadAdminTags();
        } else {
            showError('Ошибка удаления тега');
        }
    } catch (error) {
        console.error('Error deleting tag:', error);
        showError('Ошибка удаления тега');
    }
}

// Tags Management
function addSelectedTag() {
    const select = document.getElementById('channelTags');
    const tagId = select.value;
    const tagName = select.options[select.selectedIndex].text;
    
    if (!tagId || selectedTags.includes(tagId)) return;
    
    selectedTags.push(tagId);
    updateSelectedTagsDisplay();
    select.value = '';
}

function removeSelectedTag(tagId) {
    selectedTags = selectedTags.filter(id => id !== tagId);
    updateSelectedTagsDisplay();
}

function updateSelectedTagsDisplay() {
    const container = document.getElementById('selectedTags');
    
    if (selectedTags.length === 0) {
        container.innerHTML = '<div style="color: #9ca3af; font-size: 14px; text-align: center; padding: 8px;">Выберите теги для канала</div>';
        return;
    }
    
    container.innerHTML = selectedTags.map(tagId => {
        const select = document.getElementById('channelTags');
        const option = select.querySelector(`option[value="${tagId}"]`);
        const tagName = option ? option.text : 'Неизвестный тег';
        
        return `
            <div class="tag-item">
                <span>${escapeHtml(tagName)}</span>
                <button class="tag-remove" onclick="removeSelectedTag('${tagId}')">×</button>
            </div>
        `;
    }).join('');
}

function openAddTagModal() {
    document.getElementById('addTagModal').classList.remove('hidden');
}

function closeAddTagModal() {
    document.getElementById('addTagModal').classList.add('hidden');
    document.getElementById('addTagForm').reset();
}

async function handleAddTag(e) {
    e.preventDefault();
    
    const tagName = document.getElementById('tagName').value.trim();
    
    if (!tagName) return;
    
    try {
        const response = await fetch('/api/admin/tags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: tagName })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess('Тег добавлен');
            closeAddTagModal();
            loadTags(); // Reload tags in add channel form
            if (currentPage === 'adminPanel') {
                loadAdminTags();
            }
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding tag:', error);
        showError('Ошибка добавления тега');
    }
}

// Update form handlers
document.getElementById('addChannelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const channelData = {
        title: document.getElementById('channelName').value,
        description: document.getElementById('channelDescription').value,
        link: document.getElementById('channelLink').value,
        tags: selectedTags
    };
    
    try {
        const response = await fetch('/api/channels', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(channelData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            e.target.reset();
            selectedTags = [];
            updateSelectedTagsDisplay();
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding channel:', error);
        showError('Ошибка добавления канала');
    }
});

// Admin Management Functions
async function loadAdminAdmins() {
    try {
        const response = await fetch('/api/admin/admins');
        const admins = await response.json();
        displayAdminAdmins(admins);
    } catch (error) {
        console.error('Error loading admins:', error);
        showError('Ошибка загрузки админов');
    }
}

function displayAdminAdmins(admins) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <button class="submit-button" onclick="openAddAdminModal()" style="margin: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Добавить админа
            </button>
        </div>
        ${admins.map(admin => `
            <div class="admin-item">
                <div class="admin-item-info">
                    <div class="admin-item-title">${escapeHtml(admin.username)}</div>
                    <div class="admin-item-details">ID: ${admin.id}</div>
                    <div class="admin-item-details">Создан: ${formatDate(admin.created_at)}</div>
                    <span class="admin-item-status approved">Админ</span>
                </div>
                <div class="admin-item-actions">
                    <button class="admin-action-btn delete" onclick="deleteAdmin(${admin.id})" title="Удалить админа">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"></polyline>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('')}
    `;
}

function openAddAdminModal() {
    document.getElementById('addAdminModal').classList.remove('hidden');
}

function closeAddAdminModal() {
    document.getElementById('addAdminModal').classList.add('hidden');
    document.getElementById('addAdminForm').reset();
}

async function handleAddAdmin(e) {
    e.preventDefault();
    
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const passwordConfirm = document.getElementById('adminPasswordConfirm').value;
    
    if (!username || !password) {
        showError('Заполните все поля');
        return;
    }
    
    if (password !== passwordConfirm) {
        showError('Пароли не совпадают');
        return;
    }
    
    if (password.length < 6) {
        showError('Пароль должен содержать минимум 6 символов');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/admins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            closeAddAdminModal();
            loadAdminAdmins(); // Reload admins list
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding admin:', error);
        showError('Ошибка добавления админа');
    }
}

async function deleteAdmin(adminId) {
    if (!confirm('Вы уверены, что хотите удалить этого админа?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/admins/${adminId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            loadAdminAdmins(); // Reload admins list
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error deleting admin:', error);
        showError('Ошибка удаления админа');
    }
}

// Admin Users Functions
async function loadAdminUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const users = await response.json();
        displayAdminUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Ошибка загрузки пользователей');
    }
}

function displayAdminUsers(users) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
        <div class="admin-stats-header">
            <h3>Всего пользователей: ${users.length}</h3>
        </div>
        ${users.map(user => `
            <div class="admin-item">
                <div class="admin-item-info">
                    <div class="admin-item-title">
                        ${user.first_name || ''} ${user.last_name || ''} 
                        ${user.username ? `(@${user.username})` : ''}
                    </div>
                    <div class="admin-item-details">ID: ${user.telegram_id}</div>
                    <div class="admin-item-details">Язык: ${user.language_code || 'Не указан'}</div>
                    <div class="admin-item-details">Premium: ${user.is_premium ? 'Да' : 'Нет'}</div>
                    <div class="admin-item-details">Каналов: ${user.channels_count || 0}</div>
                    <div class="admin-item-details">Отзывов: ${user.reviews_count || 0}</div>
                    <div class="admin-item-details">Тегов: ${user.tags_count || 0}</div>
                    <div class="admin-item-details">Регистрация: ${formatDate(user.created_at)}</div>
                    <div class="admin-item-details">Последний визит: ${formatDate(user.last_seen)}</div>
                </div>
            </div>
        `).join('')}
    `;
}

// Admin Statistics Functions
async function loadAdminStatistics() {
    try {
        const response = await fetch('/api/admin/statistics');
        const stats = await response.json();
        displayAdminStatistics(stats);
    } catch (error) {
        console.error('Error loading statistics:', error);
        showError('Ошибка загрузки статистики');
    }
}

function displayAdminStatistics(stats) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
        <div class="admin-stats-header">
            <h3>Общая статистика</h3>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <h4>Пользователи</h4>
                <div class="stat-number">${stats.totals.total_users}</div>
            </div>
            <div class="stat-card">
                <h4>Каналы</h4>
                <div class="stat-number">${stats.totals.total_channels}</div>
            </div>
            <div class="stat-card">
                <h4>Отзывы</h4>
                <div class="stat-number">${stats.totals.total_reviews}</div>
            </div>
            <div class="stat-card">
                <h4>Теги</h4>
                <div class="stat-number">${stats.totals.total_tags}</div>
            </div>
        </div>
        
        <div class="stats-section">
            <h4>Топ стран</h4>
            <div class="stats-list">
                ${stats.topCountries.map(country => `
                    <div class="stat-item">
                        <span>${country.country || 'Неизвестно'}</span>
                        <span>${country.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="stats-section">
            <h4>Топ браузеров</h4>
            <div class="stats-list">
                ${stats.topBrowsers.map(browser => `
                    <div class="stat-item">
                        <span>${browser.browser || 'Неизвестно'}</span>
                        <span>${browser.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="stats-section">
            <h4>Топ устройств</h4>
            <div class="stats-list">
                ${stats.topDevices.map(device => `
                    <div class="stat-item">
                        <span>${device.device_type || 'Неизвестно'}</span>
                        <span>${device.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="stats-section">
            <h4>Регистрации за последние 30 дней</h4>
            <div class="stats-list">
                ${stats.dailyRegistrations.map(day => `
                    <div class="stat-item">
                        <span>${formatDate(day.date)}</span>
                        <span>${day.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('Telegram Catalog App initialized');
    
    // Telegram Widget will be initialized automatically when modal opens
    
    // Check for existing session
    const existingToken = localStorage.getItem('session_token');
    if (existingToken) {
        sessionToken = existingToken;
        // Try to get user info
        fetch('/api/user/me', {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        })
        .then(response => response.json())
        .then(user => {
            if (user.id) {
                currentUser = user;
                updateAuthUI();
            }
        })
        .catch(() => {
            // Invalid session, clear it
            localStorage.removeItem('session_token');
            sessionToken = null;
        });
    }
    
    // Add event listeners
    document.getElementById('loginForm').addEventListener('submit', handleAdminLogin);
    document.getElementById('addTagForm').addEventListener('submit', handleAddTag);
    document.getElementById('addAdminForm').addEventListener('submit', handleAddAdmin);
    
    // Initialize selected tags display
    updateSelectedTagsDisplay();
    
    // Ensure admin dashboard is hidden on page load
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    isAdminLoggedIn = false;
    
    // Add main-page class for black and white theme
    document.body.classList.add('main-page');
    
    // Update auth UI
    updateAuthUI();
});