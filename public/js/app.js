class PlexPlaylistManager {
    constructor() {
        this.isConnected = false;
        this.currentPlaylist = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateConnectionStatus();
        this.checkAutoConnection();
        this.handleInitialRoute();
        
        // Handle browser back/forward navigation
        window.addEventListener('popstate', (e) => {
            this.handleRouteChange(e.state);
        });
    }

    handleInitialRoute() {
        // Check if we're on a playlist URL
        const path = window.location.pathname;
        const playlistMatch = path.match(/^\/playlist\/(\d+)$/);
        
        if (playlistMatch) {
            this.pendingPlaylistId = playlistMatch[1];
        }
    }

    handleRouteChange(state) {
        if (state && state.view === 'playlist' && state.playlistId) {
            this.viewPlaylist(state.playlistId, false); // false = don't push state again
        } else if (state && state.view === 'playlists') {
            this.switchView('playlists');
        } else {
            // Default to playlists view
            this.switchView('playlists');
        }
    }

    navigateToPlaylists() {
        history.pushState(
            { view: 'playlists' },
            '',
            '/'
        );
        this.switchView('playlists');
    }

    async checkAutoConnection() {
        try {
            // Check if we're already connected by trying to load playlists
            const response = await fetch('/api/playlists');
            if (response.ok) {
                this.isConnected = true;
                this.updateConnectionStatus();
                this.showDashboard();
                this.loadLibraries();
                
                // Check if we have a pending playlist to load from the URL
                if (this.pendingPlaylistId) {
                    this.viewPlaylist(this.pendingPlaylistId, false);
                    this.pendingPlaylistId = null;
                } else {
                    this.loadPlaylists();
                }
                
                console.log('Auto-connected to Plex server');
            }
        } catch (error) {
            console.log('No auto-connection available');
        }
    }

    bindEvents() {
        document.getElementById('connectionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.connect();
        });

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchView(e.target.dataset.view);
            });
        });

        document.getElementById('createPlaylistBtn').addEventListener('click', () => {
            this.showCreatePlaylistModal();
        });

        document.getElementById('modalClose').addEventListener('click', () => {
            this.hideModal('playlistModal');
        });

        document.getElementById('playlistDetailsClose').addEventListener('click', () => {
            this.hideModal('playlistDetailsModal');
        });

        document.getElementById('trackDetailsClose').addEventListener('click', () => {
            this.hideModal('trackDetailsModal');
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.hideModal('playlistModal');
        });

        document.getElementById('playlistForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createPlaylist();
        });

        document.getElementById('searchBtn').addEventListener('click', () => {
            this.performSearch();
        });

        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        document.getElementById('toastClose').addEventListener('click', () => {
            this.hideToast();
        });

        // Logs functionality
        document.getElementById('refreshLogsBtn').addEventListener('click', () => {
            this.loadLogs();
        });

        document.getElementById('clearLogsBtn').addEventListener('click', () => {
            this.clearLogs();
        });

        document.getElementById('logLevelFilter').addEventListener('change', () => {
            this.filterLogs();
        });

        document.getElementById('logSearchFilter').addEventListener('input', () => {
            this.filterLogs();
        });

        // Back to playlists button
        document.getElementById('backToPlaylistsBtn').addEventListener('click', () => {
            this.navigateToPlaylists();
        });
    }

    bindPlaylistEvents() {
        // Playlist card click events
        document.querySelectorAll('.playlist-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.playlist-actions')) {
                    const playlistId = card.dataset.playlistId;
                    this.viewPlaylist(playlistId);
                }
            });
        });

        // View playlist button events
        document.querySelectorAll('.view-playlist').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playlistId = btn.dataset.playlistId;
                this.viewPlaylist(playlistId);
            });
        });

        // Delete playlist button events
        document.querySelectorAll('.delete-playlist').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playlistId = btn.dataset.playlistId;
                const playlistTitle = btn.dataset.playlistTitle;
                this.deletePlaylist(playlistId, playlistTitle);
            });
        });
    }

    async connect() {
        const serverUrl = document.getElementById('serverUrl').value;
        const token = document.getElementById('token').value;

        if (!serverUrl || !token) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }

        try {
            const response = await fetch('/api/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ serverUrl, token }),
            });

            const result = await response.json();

            if (response.ok) {
                this.isConnected = true;
                this.updateConnectionStatus();
                this.showDashboard();
                this.loadPlaylists();
                this.loadLibraries();
                this.showToast('Connected successfully!', 'success');
            } else {
                this.showToast(result.error || 'Connection failed', 'error');
            }
        } catch (error) {
            this.showToast('Connection failed: ' + error.message, 'error');
        }
    }

    updateConnectionStatus() {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');

        if (this.isConnected) {
            statusIndicator.classList.add('online');
            statusText.textContent = 'Connected';
        } else {
            statusIndicator.classList.remove('online');
            statusText.textContent = 'Not Connected';
        }
    }

    showDashboard() {
        document.getElementById('connectionPanel').style.display = 'none';
        document.getElementById('dashboard').style.display = 'grid';
    }

    switchView(viewName) {
        const activeView = document.querySelector('.view.active');
        if (activeView && activeView.id === `${viewName}View`) {
            return;
        }

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        // Hide filter panel when not in playlist detail view
        const filterPanel = document.getElementById('playlistFilters');
        if (viewName !== 'playlistDetail') {
            filterPanel.style.display = 'none';
        }

        // Handle playlist detail view (doesn't have a nav item)
        if (viewName === 'playlistDetail') {
            document.getElementById('playlistDetailView').classList.add('active');
        } else {
            const navItem = document.querySelector(`[data-view="${viewName}"]`);
            const viewElement = document.getElementById(`${viewName}View`);
            
            if (navItem) navItem.classList.add('active');
            if (viewElement) viewElement.classList.add('active');
        }

        if (viewName === 'playlists') {
            this.loadPlaylists();
        } else if (viewName === 'libraries') {
            this.loadLibraries();
        } else if (viewName === 'logs') {
            this.loadLogs();
        }
    }

    async loadPlaylists() {
        this.switchView('playlists');
        const tableBody = document.getElementById('playlistsTableBody');
        if (!tableBody) {
            return;
        }
        tableBody.innerHTML = '<tr><td colspan="6" class="loading"><i class="fas fa-spinner fa-spin"></i> Loading playlists...</td></tr>';

        try {
            const response = await fetch('/api/playlists');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const playlists = await response.json();
            this.renderPlaylists(playlists);
        } catch (error) {
            console.error('❌ Error loading playlists:', error);
            tableBody.innerHTML = `<tr><td colspan="6" class="error">Error loading playlists: ${error.message}</td></tr>`;
        }
    }

    renderPlaylists(playlists) {
        const tableBody = document.getElementById('playlistsTableBody');
        
        if (playlists.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No playlists found. Create your first playlist!</td></tr>';
            return;
        }

        const playlistRows = playlists.map(playlist => {
            const typeIcon = this.getPlaylistTypeIcon(playlist.playlistType);
            const smartIcon = playlist.smart ? ' <i class="fas fa-bolt smart-playlist-icon" title="Smart Playlist"></i>' : '';
            const addedDate = playlist.addedAt ? this.formatDate(playlist.addedAt) : 'Unknown';
            const updatedDate = playlist.updatedAt ? this.formatDate(playlist.updatedAt) : 'Unknown';
            
            return `
                <tr data-playlist-id="${playlist.ratingKey}" data-added="${playlist.addedAt || 0}" data-updated="${playlist.updatedAt || 0}">
                    <td><i class="${typeIcon} playlist-type-icon" title="${this.getPlaylistTypeLabel(playlist.playlistType)}"></i> ${this.escapeHtml(playlist.title)}${smartIcon}</td>
                    <td>${playlist.leafCount || 0}</td>
                    <td>${playlist.duration ? this.formatDuration(playlist.duration) : 'Unknown'}</td>
                    <td>${addedDate}</td>
                    <td>${updatedDate}</td>
                    <td class="playlist-actions">
                        <button class="btn btn-secondary view-playlist" data-playlist-id="${playlist.ratingKey}">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-danger delete-playlist" data-playlist-id="${playlist.ratingKey}" data-playlist-title="${this.escapeHtml(playlist.title)}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = playlistRows.join('');
        
        // Add event listeners for playlist rows
        this.bindPlaylistEvents();
        this.bindSortableTableHeaders();
    }

    getPlaylistTypeIcon(type) {
        const icons = {
            'audio': 'fas fa-music',
            'video': 'fas fa-film',
            'photo': 'fas fa-images'
        };
        return icons[type] || 'fas fa-list';
    }

    getPlaylistTypeLabel(type) {
        const labels = {
            'audio': 'Audio Playlist',
            'video': 'Video Playlist',
            'photo': 'Photo Playlist'
        };
        return labels[type] || 'Playlist';
    }

    formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString(undefined, { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    bindSortableTableHeaders() {
        const table = document.querySelector('.playlist-table');
        if (!table) return;

        const tableBody = table.tBodies[0];
        const originalRows = Array.from(tableBody.querySelectorAll('tr'));

        document.querySelectorAll('.playlist-table th[data-sort]').forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.dataset.sort;
                let sortDirection = header.dataset.sortDirection;

                if (sortDirection === 'desc') {
                    sortDirection = 'asc';
                } else if (sortDirection === 'asc') {
                    sortDirection = 'default';
                } else {
                    sortDirection = 'desc';
                }

                header.dataset.sortDirection = sortDirection;

                // Update visual indicator
                document.querySelectorAll('.playlist-table th[data-sort]').forEach(th => {
                    th.classList.remove('sort-asc', 'sort-desc');
                });

                if (sortDirection === 'default') {
                    tableBody.innerHTML = '';
                    originalRows.forEach(row => tableBody.appendChild(row));
                    return;
                }
                
                header.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');


                const rows = Array.from(tableBody.querySelectorAll('tr'));

                rows.sort((a, b) => {
                    // Handle date sorting using data attributes
                    if (sortKey === 'added' || sortKey === 'updated') {
                        const aValue = parseInt(a.dataset[sortKey]) || 0;
                        const bValue = parseInt(b.dataset[sortKey]) || 0;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                    }
                    
                    const aValue = a.querySelector(`td:nth-child(${this.getColumnIndex(sortKey)})`).textContent;
                    const bValue = b.querySelector(`td:nth-child(${this.getColumnIndex(sortKey)})`).textContent;

                    if (sortKey === 'tracks') {
                        const aNum = parseInt(aValue) || 0;
                        const bNum = parseInt(bValue) || 0;
                        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
                    } else if (sortKey === 'duration') {
                        return sortDirection === 'asc' ? this.durationToSeconds(aValue) - this.durationToSeconds(bValue) : this.durationToSeconds(bValue) - this.durationToSeconds(aValue);
                    }
                    else {
                        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
                    }
                });

                rows.forEach(row => tableBody.appendChild(row));
            });
        });
    }

    getColumnIndex(sortKey) {
        const headers = Array.from(document.querySelectorAll('.playlist-table th[data-sort]'));
        const index = headers.findIndex(header => header.dataset.sort === sortKey);
        return index + 1;
    }

    durationToSeconds(duration) {
        const parts = duration.match(/(\d+h)?\s*(\d+m)?\s*(\d+s)?/);
        if (!parts) return 0;
        const hours = parseInt(parts[1]) || 0;
        const minutes = parseInt(parts[2]) || 0;
        const seconds = parseInt(parts[3]) || 0;
        return hours * 3600 + minutes * 60 + seconds;
    }

    async loadLibraries() {
        const grid = document.getElementById('librariesGrid');
        grid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading libraries...</div>';

        try {
            const response = await fetch('/api/libraries');
            const libraries = await response.json();

            if (response.ok) {
                this.renderLibraries(libraries);
            } else {
                grid.innerHTML = `<div class="error">Error loading libraries: ${libraries.error}</div>`;
            }
        } catch (error) {
            grid.innerHTML = `<div class="error">Error loading libraries: ${error.message}</div>`;
        }
    }

    renderLibraries(libraries) {
        const grid = document.getElementById('librariesGrid');
        
        if (libraries.length === 0) {
            grid.innerHTML = '<div class="empty-state">No libraries found.</div>';
            return;
        }

        grid.innerHTML = libraries.map(library => `
            <div class="library-card">
                <i class="fas fa-${this.getLibraryIcon(library.type)}"></i>
                <h3>${library.title}</h3>
                <p>${library.type}</p>
            </div>
        `).join('');
    }

    getLibraryIcon(type) {
        const icons = {
            'movie': 'film',
            'show': 'tv',
            'artist': 'music',
            'photo': 'images'
        };
        return icons[type] || 'folder';
    }

    showCreatePlaylistModal() {
        document.getElementById('playlistName').value = '';
        this.showModal('playlistModal');
    }

    async createPlaylist() {
        const name = document.getElementById('playlistName').value.trim();
        
        if (!name) {
            this.showToast('Please enter a playlist name', 'error');
            return;
        }

        try {
            const response = await fetch('/api/playlists', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name }),
            });

            const result = await response.json();

            if (response.ok) {
                this.hideModal('playlistModal');
                this.loadPlaylists();
                this.showToast('Playlist created successfully!', 'success');
            } else {
                this.showToast(result.error || 'Failed to create playlist', 'error');
            }
        } catch (error) {
            this.showToast('Failed to create playlist: ' + error.message, 'error');
        }
    }

    async deletePlaylist(id, name) {
        const confirmed = await this.showConfirmModal(
            `Are you sure you want to delete "${name}"?`,
            { title: 'Delete Playlist', confirmText: 'Delete', danger: true }
        );
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`/api/playlists/${id}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (response.ok) {
                const row = document.querySelector(`tr[data-playlist-id="${id}"]`);
                if (row) {
                    row.remove();
                }
                this.showToast('Playlist deleted successfully!', 'success');
            } else {
                this.showToast(result.error || 'Failed to delete playlist', 'error');
            }
        } catch (error) {
            this.showToast('Failed to delete playlist: ' + error.message, 'error');
        }
    }

    async viewPlaylist(id, updateUrl = true) {
        // Immediately switch to playlist detail view with skeleton loading
        this.showPlaylistDetailSkeleton();
        
        // Update URL if requested
        if (updateUrl) {
            history.pushState(
                { view: 'playlist', playlistId: id },
                '',
                `/playlist/${id}`
            );
        }
        
        try {
            const response = await fetch(`/api/playlists/${id}`);
            const playlist = await response.json();

            if (response.ok) {
                this.showPlaylistDetails(playlist);
            } else {
                this.showPlaylistError(playlist.error || 'Failed to load playlist details');
            }
        } catch (error) {
            this.showPlaylistError('Failed to load playlist details: ' + error.message);
        }
    }

    showPlaylistDetailSkeleton() {
        // Switch to the playlist detail view immediately
        this.switchView('playlistDetail');
        
        document.getElementById('playlistDetailTitle').innerHTML = `<i class="fas fa-music"></i> Loading...`;
        
        // Show skeleton loading state
        const info = document.getElementById('playlistDetailInfo');
        info.innerHTML = `
            <div class="skeleton-playlist-info">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-meta"></div>
                <div class="skeleton skeleton-meta" style="width: 30%;"></div>
            </div>
        `;

        const tracksContainer = document.getElementById('playlistDetailTracks');
        tracksContainer.innerHTML = `
            <div class="skeleton-track-list">
                ${Array.from({length: 8}, (_, i) => `
                    <div class="skeleton-track-item">
                        <div class="skeleton-track-info">
                            <div class="skeleton skeleton-track-title"></div>
                            <div class="skeleton skeleton-track-artist"></div>
                        </div>
                        <div class="skeleton-track-actions">
                            <div class="skeleton skeleton-rating"></div>
                            <div class="skeleton skeleton-remove-btn"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    showPlaylistError(errorMessage) {
        // Switch to the playlist detail view if not already there
        this.switchView('playlistDetail');
        
        document.getElementById('playlistDetailTitle').innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error Loading Playlist`;
        
        const info = document.getElementById('playlistDetailInfo');
        info.innerHTML = `
            <div class="playlist-summary">
                <div class="error" style="padding: 2rem; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--error-color); margin-bottom: 1rem;"></i>
                    <h4>Failed to Load Playlist</h4>
                    <p>${this.escapeHtml(errorMessage)}</p>
                    <button class="btn btn-primary" onclick="app.navigateToPlaylists()" style="margin-top: 1rem;">
                        <i class="fas fa-arrow-left"></i> Back to Playlists
                    </button>
                </div>
            </div>
        `;

        const tracksContainer = document.getElementById('playlistDetailTracks');
        tracksContainer.innerHTML = '';
        
        this.showToast(errorMessage, 'error');
    }

    showPlaylistDetails(data) {
        const playlist = data.playlist;
        const items = data.items || [];
        
        // Preserve current filter state if we're refreshing the same playlist
        if (this.currentPlaylist && this.currentPlaylist.playlist.ratingKey === playlist.ratingKey) {
            this.preserveFilterState();
        } else {
            this.clearFilterState();
        }
        
        // Switch to the playlist detail view
        this.switchView('playlistDetail');
        
        // Show the filter panel
        document.getElementById('playlistFilters').style.display = 'block';
        
        document.getElementById('playlistDetailTitle').innerHTML = `<i class="fas fa-music"></i> ${playlist.title}`;
        
        const info = document.getElementById('playlistDetailInfo');
        info.innerHTML = `
            <div class="playlist-summary">
                <h4>${playlist.title}</h4>
                <p><i class="fas fa-music"></i> ${playlist.leafCount || 0} tracks</p>
                <p><i class="fas fa-clock"></i> ${playlist.duration ? this.formatDuration(playlist.duration) : 'Unknown duration'}</p>
                ${playlist.summary ? `<p class="playlist-description">${this.escapeHtml(playlist.summary)}</p>` : ''}
            </div>
        `;

        const tracksContainer = document.getElementById('playlistDetailTracks');
        if (items && items.length > 0) {
            // Initialize pagination state
            this.tracksPagination = {
                currentPage: 1,
                pageSize: 1000,
                searchQuery: ''
            };
            
            tracksContainer.innerHTML = `
                <div class="tracks-toolbar">
                    <div class="tracks-search">
                        <i class="fas fa-search"></i>
                        <input type="text" id="trackSearchInput" placeholder="Search tracks..." />
                    </div>
                    <div class="bulk-actions-bar" id="bulkActions" style="display: none;">
                        <span class="selected-count" id="selectedCount">0 selected</span>
                        <button class="btn btn-danger" id="removeSelectedBtn">
                            <i class="fas fa-trash"></i> Remove Selected
                        </button>
                    </div>
                </div>
                <div id="trackItems"></div>
                <div class="tracks-pagination" id="tracksPagination"></div>
            `;
        } else {
            tracksContainer.innerHTML = '<p>No tracks in this playlist.</p>';
        }

        this.currentPlaylist = data;
        
        if (items && items.length > 0) {
            this.renderPaginatedTracks();
            this.bindTrackSearchEvent();
        }
        
        this.bindRatingEvents();
        this.bindSortByRatingEvent();
        this.bindRatingFilterEvent();
        this.bindTrackSelectionEvents();
        this.bindTrackTitleClickEvents();
        
        // Restore filter state after binding events
        setTimeout(() => {
            this.restoreFilterState();
        }, 100);
    }

    getFilteredTracks() {
        const items = this.currentPlaylist?.items || [];
        const query = this.tracksPagination.searchQuery.toLowerCase();
        
        if (!query) {
            return items;
        }
        
        return items.filter(track => {
            const title = (track.title || '').toLowerCase();
            const artist = (track.grandparentTitle || '').toLowerCase();
            const album = (track.parentTitle || '').toLowerCase();
            return title.includes(query) || artist.includes(query) || album.includes(query);
        });
    }

    renderPaginatedTracks() {
        const playlist = this.currentPlaylist.playlist;
        const filteredItems = this.getFilteredTracks();
        const { currentPage, pageSize } = this.tracksPagination;
        
        const totalItems = filteredItems.length;
        const totalPages = Math.ceil(totalItems / pageSize);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, totalItems);
        const paginatedItems = filteredItems.slice(startIndex, endIndex);
        
        const trackItemsContainer = document.getElementById('trackItems');
        
        if (paginatedItems.length === 0) {
            trackItemsContainer.innerHTML = `
                <div class="empty-tracks-message">
                    <i class="fas fa-search"></i>
                    <p>No tracks found matching "${this.escapeHtml(this.tracksPagination.searchQuery)}"</p>
                </div>
            `;
        } else {
            trackItemsContainer.innerHTML = `
                <div class="track-item select-all-row">
                    <label class="track-checkbox">
                        <input type="checkbox" id="selectAllTracks">
                        <span class="checkmark"></span>
                    </label>
                    <div class="track-info select-all-label">
                        <h5>Select All (on this page)</h5>
                    </div>
                </div>
                ${paginatedItems.map((track) => {
                    // Find the original index in the full items array
                    const originalIndex = this.currentPlaylist.items.indexOf(track);
                    return `
                    <div class="track-item" data-rating="${track.userRating || 0}" data-track-id="${track.ratingKey}" data-playlist-item-id="${track.playlistItemID}" data-track-index="${originalIndex}">
                        <label class="track-checkbox">
                            <input type="checkbox" class="track-select" data-playlist-item-id="${track.playlistItemID}">
                            <span class="checkmark"></span>
                        </label>
                        <div class="track-info">
                            <h5 class="track-title-link" data-track-index="${originalIndex}">${this.escapeHtml(track.title)}</h5>
                            <p>${this.escapeHtml(track.grandparentTitle || 'Unknown Artist')} - ${this.escapeHtml(track.parentTitle || 'Unknown Album')}</p>
                        </div>
                        <div class="track-actions">
                            <div class="rating">
                                ${[...Array(5).keys()].map(i => `<i class="fas fa-star ${track.userRating && track.userRating >= (i + 1) * 2 ? 'rated' : ''}" data-track-id="${track.ratingKey}" data-rating="${(i + 1) * 2}"></i>`).join('')}
                            </div>
                            <button class="btn btn-danger" onclick="app.removeTrackFromPlaylist('${playlist.ratingKey}', '${track.playlistItemID}')">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                `}).join('')}
            `;
        }
        
        // Render pagination controls
        this.renderPaginationControls(totalItems, totalPages, currentPage);
        
        // Rebind events for the new elements
        this.bindRatingEvents();
        this.bindTrackSelectionEvents();
        this.bindTrackTitleClickEvents();
    }

    renderPaginationControls(totalItems, totalPages, currentPage) {
        const paginationContainer = document.getElementById('tracksPagination');
        const { pageSize } = this.tracksPagination;
        const startItem = totalItems === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
        const endItem = Math.min(currentPage * pageSize, totalItems);
        
        paginationContainer.innerHTML = `
            <div class="pagination-info">
                Showing ${startItem}-${endItem} of ${totalItems} tracks
            </div>
            <div class="pagination-controls">
                <button class="btn btn-secondary pagination-btn" id="prevPageBtn" ${currentPage <= 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Previous
                </button>
                <span class="pagination-current">Page ${currentPage} of ${totalPages || 1}</span>
                <button class="btn btn-secondary pagination-btn" id="nextPageBtn" ${currentPage >= totalPages ? 'disabled' : ''}>
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="pagination-size">
                <label for="pageSizeSelect">Tracks per page:</label>
                <select id="pageSizeSelect">
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                    <option value="250" ${pageSize === 250 ? 'selected' : ''}>250</option>
                    <option value="500" ${pageSize === 500 ? 'selected' : ''}>500</option>
                    <option value="1000" ${pageSize === 1000 ? 'selected' : ''}>1000</option>
                    <option value="2000" ${pageSize === 2000 ? 'selected' : ''}>2000</option>
                    <option value="5000" ${pageSize === 5000 ? 'selected' : ''}>5000</option>
                    <option value="10000" ${pageSize === 10000 ? 'selected' : ''}>10000</option>
                </select>
            </div>
        `;
        
        // Bind pagination events
        document.getElementById('prevPageBtn')?.addEventListener('click', () => {
            if (this.tracksPagination.currentPage > 1) {
                this.tracksPagination.currentPage--;
                this.renderPaginatedTracks();
                this.scrollToTracksTop();
            }
        });
        
        document.getElementById('nextPageBtn')?.addEventListener('click', () => {
            if (this.tracksPagination.currentPage < totalPages) {
                this.tracksPagination.currentPage++;
                this.renderPaginatedTracks();
                this.scrollToTracksTop();
            }
        });
        
        document.getElementById('pageSizeSelect')?.addEventListener('change', (e) => {
            this.tracksPagination.pageSize = parseInt(e.target.value);
            this.tracksPagination.currentPage = 1; // Reset to first page
            this.renderPaginatedTracks();
        });
    }

    scrollToTracksTop() {
        const trackItems = document.getElementById('trackItems');
        if (trackItems) {
            trackItems.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    bindTrackSearchEvent() {
        const searchInput = document.getElementById('trackSearchInput');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.tracksPagination.searchQuery = e.target.value;
                    this.tracksPagination.currentPage = 1; // Reset to first page on search
                    this.renderPaginatedTracks();
                }, 300); // Debounce for 300ms
            });
        }
    }

    bindTrackTitleClickEvents() {
        document.querySelectorAll('.track-title-link').forEach(titleElement => {
            titleElement.addEventListener('click', (e) => {
                e.stopPropagation();
                const trackIndex = parseInt(e.target.dataset.trackIndex);
                if (this.currentPlaylist && this.currentPlaylist.items && this.currentPlaylist.items[trackIndex]) {
                    this.showTrackDetails(this.currentPlaylist.items[trackIndex]);
                }
            });
        });
    }

    showTrackDetails(track) {
        const modal = document.getElementById('trackDetailsModal');
        const titleElement = document.getElementById('trackDetailsTitle');
        const contentElement = document.getElementById('trackDetailsContent');
        
        titleElement.textContent = 'Track Details';
        
        // Format duration
        const duration = track.duration ? this.formatDuration(track.duration) : 'Unknown';
        
        // Format rating as stars
        const ratingStars = [...Array(5).keys()].map(i => 
            `<i class="fas fa-star ${track.userRating && track.userRating >= (i + 1) * 2 ? 'rated' : ''}"></i>`
        ).join('');
        const ratingText = track.userRating ? `${track.userRating / 2}/5` : 'Not rated';
        
        // Format dates
        const addedAt = track.addedAt ? new Date(track.addedAt * 1000).toLocaleDateString() : 'Unknown';
        const updatedAt = track.updatedAt ? new Date(track.updatedAt * 1000).toLocaleDateString() : 'Unknown';
        const releaseDate = track.originallyAvailableAt || (track.year ? track.year.toString() : 'Unknown');
        
        // Get media info if available
        let mediaInfoHtml = '';
        if (track.Media && track.Media.length > 0) {
            const media = track.Media[0];
            const parts = media.Part || [];
            const part = parts[0] || {};
            
            const codec = media.audioCodec || media.codec || 'Unknown';
            const bitrate = media.bitrate ? `${media.bitrate} kbps` : 'Unknown';
            const channels = media.audioChannels ? `${media.audioChannels} channels` : '';
            const container = part.container || media.container || 'Unknown';
            const fileSize = part.size ? this.formatFileSize(part.size) : 'Unknown';
            
            mediaInfoHtml = `
                <div class="track-details-section">
                    <h4><i class="fas fa-file-audio"></i> Media Information</h4>
                    <div class="media-info-container">
                        <div class="media-info-item">
                            <i class="fas fa-wave-square"></i>
                            <span>Format: ${codec.toUpperCase()} (${container.toUpperCase()})</span>
                        </div>
                        ${bitrate !== 'Unknown' ? `
                        <div class="media-info-item">
                            <i class="fas fa-tachometer-alt"></i>
                            <span>Bitrate: ${bitrate}</span>
                        </div>` : ''}
                        ${channels ? `
                        <div class="media-info-item">
                            <i class="fas fa-volume-up"></i>
                            <span>Audio: ${channels}</span>
                        </div>` : ''}
                        ${fileSize !== 'Unknown' ? `
                        <div class="media-info-item">
                            <i class="fas fa-hdd"></i>
                            <span>File Size: ${fileSize}</span>
                        </div>` : ''}
                    </div>
                </div>
            `;
        }
        
        // Build artwork HTML
        const artworkHtml = track.thumb 
            ? `<img src="${track.thumb}" alt="${this.escapeHtml(track.title)}" class="track-details-artwork" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="track-details-artwork-placeholder" style="display:none;"><i class="fas fa-music"></i></div>`
            : `<div class="track-details-artwork-placeholder"><i class="fas fa-music"></i></div>`;
        
        contentElement.innerHTML = `
            <div class="track-details-header">
                ${artworkHtml}
                <div class="track-details-main">
                    <h2>${this.escapeHtml(track.title)}</h2>
                    <p class="track-artist">${this.escapeHtml(track.grandparentTitle || 'Unknown Artist')}</p>
                    <p class="track-album">${this.escapeHtml(track.parentTitle || 'Unknown Album')}</p>
                    <div class="track-details-rating">
                        ${ratingStars}
                        <span class="rating-label">${ratingText}</span>
                    </div>
                </div>
            </div>
            
            <div class="track-details-section">
                <h4><i class="fas fa-info-circle"></i> Track Information</h4>
                <div class="track-details-grid">
                    <div class="track-detail-item">
                        <span class="label">Duration</span>
                        <span class="value">${duration}</span>
                    </div>
                    <div class="track-detail-item">
                        <span class="label">Track Number</span>
                        <span class="value">${track.index || 'Unknown'}${track.parentIndex ? ` (Disc ${track.parentIndex})` : ''}</span>
                    </div>
                    <div class="track-detail-item">
                        <span class="label">Release Date</span>
                        <span class="value">${releaseDate}</span>
                    </div>
                    <div class="track-detail-item">
                        <span class="label">Added to Library</span>
                        <span class="value">${addedAt}</span>
                    </div>
                    ${track.viewCount ? `
                    <div class="track-detail-item">
                        <span class="label">Play Count</span>
                        <span class="value highlight">${track.viewCount} plays</span>
                    </div>` : ''}
                    ${track.lastViewedAt ? `
                    <div class="track-detail-item">
                        <span class="label">Last Played</span>
                        <span class="value">${new Date(track.lastViewedAt * 1000).toLocaleDateString()}</span>
                    </div>` : ''}
                </div>
            </div>
            
            ${mediaInfoHtml}
            
            <div class="track-details-section">
                <h4><i class="fas fa-database"></i> Identifiers</h4>
                <div class="track-details-grid">
                    <div class="track-detail-item">
                        <span class="label">Track ID</span>
                        <span class="value">${track.ratingKey || 'Unknown'}</span>
                    </div>
                    ${track.playlistItemID ? `
                    <div class="track-detail-item">
                        <span class="label">Playlist Item ID</span>
                        <span class="value">${track.playlistItemID}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
        
        this.showModal('trackDetailsModal');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    preserveFilterState() {
        const selectedRatings = Array.from(document.querySelectorAll('#ratingFilterDropdown input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.dataset.ratingValue);
        
        this.savedFilterState = {
            selectedRatings: selectedRatings
        };
    }

    restoreFilterState() {
        if (!this.savedFilterState) return;
        
        // Restore checkbox states
        this.savedFilterState.selectedRatings.forEach(ratingValue => {
            const checkbox = document.querySelector(`#ratingFilterDropdown input[data-rating-value="${ratingValue}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
        
        // Update filter button text and apply filters
        this.updateFilterButtonText();
        this.applyRatingFilters();
    }

    clearFilterState() {
        this.savedFilterState = null;
    }

    bindRatingFilterEvent() {
        const ratingFilterBtn = document.getElementById('ratingFilterBtn');
        const ratingFilterDropdown = document.getElementById('ratingFilterDropdown');
        
        if (ratingFilterBtn && ratingFilterDropdown) {
            // Toggle dropdown visibility
            ratingFilterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                ratingFilterDropdown.classList.toggle('show');
            });

            // Handle checkbox changes
            ratingFilterDropdown.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox') {
                    this.applyRatingFilters();
                    this.updateFilterButtonText();
                }
            });

            // Prevent dropdown from closing when clicking inside
            ratingFilterDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                ratingFilterDropdown.classList.remove('show');
            });
        }

        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                document.querySelectorAll('#ratingFilterDropdown input[type="checkbox"]').forEach(checkbox => {
                    checkbox.checked = false;
                });
                this.applyRatingFilters();
                this.updateFilterButtonText();
            });
        }
    }

    updateFilterButtonText() {
        const selectedCheckboxes = document.querySelectorAll('#ratingFilterDropdown input[type="checkbox"]:checked');
        const filterBtn = document.getElementById('ratingFilterBtn');
        
        if (selectedCheckboxes.length === 0) {
            filterBtn.innerHTML = '<i class="fas fa-filter"></i> Filter by Rating <i class="fas fa-chevron-down"></i>';
        } else {
            const count = selectedCheckboxes.length;
            filterBtn.innerHTML = `<i class="fas fa-filter"></i> Filter by Rating (${count}) <i class="fas fa-chevron-down"></i>`;
        }
    }

    applyRatingFilters() {
        const selectedRatings = Array.from(document.querySelectorAll('#ratingFilterDropdown input[type="checkbox"]:checked'))
            .map(checkbox => parseInt(checkbox.dataset.ratingValue));
        const trackItems = Array.from(document.querySelectorAll('#trackItems .track-item:not(.select-all-row)'));

        trackItems.forEach(item => {
            const itemRating = parseInt(item.dataset.rating) || 0;
            // Show track if no filters are selected OR if the track's exact rating matches any selected rating
            const isVisible = selectedRatings.length === 0 || selectedRatings.includes(itemRating);
            item.style.display = isVisible ? 'flex' : 'none';
            
            // Uncheck hidden items
            if (!isVisible) {
                const checkbox = item.querySelector('.track-select');
                if (checkbox) checkbox.checked = false;
            }
        });

        // Update selection state after filtering
        this.updateSelectionCount();
        this.updateSelectAllState();
    }

    bindSortByRatingEvent() {
        const sortByRatingBtn = document.getElementById('sortByRatingBtn');
        if (sortByRatingBtn) {
            sortByRatingBtn.addEventListener('click', () => {
                const trackItemsContainer = document.getElementById('trackItems');
                const trackItems = Array.from(trackItemsContainer.querySelectorAll('.track-item'));
                trackItems.sort((a, b) => {
                    const ratingA = parseInt(a.dataset.rating) || 0;
                    const ratingB = parseInt(b.dataset.rating) || 0;
                    return ratingB - ratingA;
                });
                trackItems.forEach(item => trackItemsContainer.appendChild(item));
            });
        }
    }

    bindRatingEvents() {
        document.querySelectorAll('.rating .fa-star').forEach(star => {
            star.addEventListener('click', (e) => {
                const trackId = e.target.dataset.trackId;
                const rating = e.target.dataset.rating;
                this.rateTrack(this.currentPlaylist.playlist.ratingKey, trackId, rating);
            });
        });
    }

    async rateTrack(playlistId, trackId, rating) {
        try {
            const response = await fetch(`/api/playlists/${playlistId}/tracks/${trackId}/rate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ rating }),
            });

            const result = await response.json();

            if (response.ok) {
                this.showToast('Track rated successfully!', 'success');
                // Update the stars UI
                const stars = document.querySelectorAll(`.rating .fa-star[data-track-id="${trackId}"]`);
                stars.forEach(star => {
                    star.classList.remove('rated');
                    if (star.dataset.rating <= rating) {
                        star.classList.add('rated');
                    }
                });
                // Update the data-rating attribute for sorting
                const trackItem = document.querySelector(`.track-item[data-track-id="${trackId}"]`);
                if (trackItem) {
                    trackItem.dataset.rating = rating;
                }

            } else {
                this.showToast(result.error || 'Failed to rate track', 'error');
            }
        } catch (error) {
            this.showToast('Failed to rate track: ' + error.message, 'error');
        }
    }

    async performSearch() {
        const query = document.getElementById('searchInput').value.trim();
        const results = document.getElementById('searchResults');

        if (!query) {
            this.showToast('Please enter a search term', 'error');
            return;
        }

        results.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}&type=track`);
            const searchResults = await response.json();

            if (response.ok) {
                this.renderSearchResults(searchResults);
            } else {
                results.innerHTML = `<div class="error">Search failed: ${searchResults.error}</div>`;
            }
        } catch (error) {
            results.innerHTML = `<div class="error">Search failed: ${error.message}</div>`;
        }
    }

    renderSearchResults(results) {
        const container = document.getElementById('searchResults');
        
        if (results.length === 0) {
            container.innerHTML = '<div class="empty-state">No results found.</div>';
            return;
        }

        container.innerHTML = results.map(track => `
            <div class="search-result">
                <img src="${track.thumb || '/images/music-placeholder.png'}" alt="${track.title}" onerror="this.src='/images/music-placeholder.png'">
                <div class="search-result-info">
                    <h4>${track.title}</h4>
                    <p>${track.grandparentTitle || 'Unknown Artist'} - ${track.parentTitle || 'Unknown Album'}</p>
                </div>
                <button class="btn btn-primary" onclick="app.showAddToPlaylistOptions('${track.ratingKey}', '${track.title}')">
                    <i class="fas fa-plus"></i> Add to Playlist
                </button>
            </div>
        `).join('');
    }

    async showAddToPlaylistOptions(trackId, trackTitle) {
        try {
            const response = await fetch('/api/playlists');
            const playlists = await response.json();

            if (response.ok && playlists.length > 0) {
                const playlistOptions = playlists.map(playlist => 
                    `<button class="btn btn-secondary" onclick="app.addTrackToPlaylist('${playlist.ratingKey}', '${trackId}', '${trackTitle}', '${playlist.title}')" style="margin: 0.25rem; display: block; width: 100%;">
                        ${playlist.title}
                    </button>`
                ).join('');

                const modal = document.createElement('div');
                modal.className = 'modal active';
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Add "${trackTitle}" to Playlist</h3>
                            <button class="modal-close" onclick="this.closest('.modal').remove()">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="modal-body">
                            ${playlistOptions}
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            } else {
                this.showToast('No playlists available. Create a playlist first.', 'error');
            }
        } catch (error) {
            this.showToast('Failed to load playlists: ' + error.message, 'error');
        }
    }

    async addTrackToPlaylist(playlistId, trackId, trackTitle, playlistTitle) {
        try {
            const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ trackId }),
            });

            const result = await response.json();

            if (response.ok) {
                this.showToast(`"${trackTitle}" added to "${playlistTitle}"!`, 'success');
                document.querySelector('.modal.active')?.remove();
            } else {
                this.showToast(result.error || 'Failed to add track to playlist', 'error');
            }
        } catch (error) {
            this.showToast('Failed to add track to playlist: ' + error.message, 'error');
        }
    }

    async removeTrackFromPlaylist(playlistId, playlistItemId) {
        // Find the track item by the playlist item ID
        const trackItem = document.querySelector(`.track-item[data-playlist-item-id="${playlistItemId}"]`);
        const removeButton = trackItem?.querySelector('.btn-danger');
        
        if (!trackItem || !removeButton) {
            console.error('Track item not found for playlistItemId:', playlistItemId);
            console.log('Available track items:', document.querySelectorAll('.track-item'));
            this.showToast('Track not found', 'error');
            return;
        }

        // Add loading state
        trackItem.classList.add('removing');
        removeButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        removeButton.disabled = true;

        try {
            const response = await fetch(`/api/playlists/${playlistId}/tracks/${playlistItemId}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (response.ok) {
                // Animate removal
                trackItem.style.transition = 'all 0.3s ease';
                trackItem.style.transform = 'translateX(-100%)';
                trackItem.style.opacity = '0';
                
                // Remove from DOM after animation
                setTimeout(() => {
                    trackItem.remove();
                    this.updateSelectionCount();
                    this.showToast('Track removed from playlist!', 'success');
                }, 300);
            } else {
                // Restore button state on error
                trackItem.classList.remove('removing');
                removeButton.innerHTML = '<i class="fas fa-times"></i>';
                removeButton.disabled = false;
                this.showToast(result.error || 'Failed to remove track', 'error');
            }
        } catch (error) {
            // Restore button state on error
            trackItem.classList.remove('removing');
            removeButton.innerHTML = '<i class="fas fa-times"></i>';
            removeButton.disabled = false;
            this.showToast('Failed to remove track: ' + error.message, 'error');
        }
    }

    bindTrackSelectionEvents() {
        const selectAllCheckbox = document.getElementById('selectAllTracks');
        const removeSelectedBtn = document.getElementById('removeSelectedBtn');
        
        // Track the last clicked checkbox for shift-click range selection
        this.lastClickedCheckbox = null;
        
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.track-select');
                checkboxes.forEach(checkbox => {
                    // Only select visible tracks (respecting filters)
                    const trackItem = checkbox.closest('.track-item');
                    if (trackItem && trackItem.style.display !== 'none') {
                        checkbox.checked = e.target.checked;
                    }
                });
                this.updateSelectionCount();
                // Reset last clicked when using select all
                this.lastClickedCheckbox = null;
            });
        }

        // Bind individual checkbox events with shift-click support
        const trackCheckboxes = document.querySelectorAll('.track-select');
        trackCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('click', (e) => {
                // Handle shift-click for range selection
                if (e.shiftKey && this.lastClickedCheckbox && this.lastClickedCheckbox !== checkbox) {
                    this.selectCheckboxRange(this.lastClickedCheckbox, checkbox);
                }
                
                // Update last clicked checkbox
                this.lastClickedCheckbox = checkbox;
            });
            
            checkbox.addEventListener('change', () => {
                this.updateSelectionCount();
                this.updateSelectAllState();
            });
        });

        if (removeSelectedBtn) {
            removeSelectedBtn.addEventListener('click', () => {
                this.removeSelectedTracks();
            });
        }
    }

    selectCheckboxRange(startCheckbox, endCheckbox) {
        // Get all visible checkboxes in order
        const allCheckboxes = Array.from(document.querySelectorAll('.track-select')).filter(cb => {
            const trackItem = cb.closest('.track-item');
            return trackItem && trackItem.style.display !== 'none';
        });
        
        const startIndex = allCheckboxes.indexOf(startCheckbox);
        const endIndex = allCheckboxes.indexOf(endCheckbox);
        
        if (startIndex === -1 || endIndex === -1) return;
        
        // Determine the range (works regardless of click order)
        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);
        
        // Set all checkboxes in range to the same state as the end checkbox
        const targetState = endCheckbox.checked;
        for (let i = minIndex; i <= maxIndex; i++) {
            allCheckboxes[i].checked = targetState;
        }
        
        this.updateSelectionCount();
        this.updateSelectAllState();
    }

    updateSelectionCount() {
        const selectedCheckboxes = document.querySelectorAll('.track-select:checked');
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = document.getElementById('selectedCount');
        
        if (selectedCheckboxes.length > 0) {
            bulkActions.style.display = 'flex';
            selectedCount.textContent = `${selectedCheckboxes.length} selected`;
        } else {
            bulkActions.style.display = 'none';
        }
    }

    updateSelectAllState() {
        const selectAllCheckbox = document.getElementById('selectAllTracks');
        const visibleCheckboxes = Array.from(document.querySelectorAll('.track-select')).filter(cb => {
            const trackItem = cb.closest('.track-item');
            return trackItem && trackItem.style.display !== 'none';
        });
        const checkedCount = visibleCheckboxes.filter(cb => cb.checked).length;
        
        if (selectAllCheckbox) {
            if (checkedCount === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else if (checkedCount === visibleCheckboxes.length) {
                selectAllCheckbox.checked = true;
                selectAllCheckbox.indeterminate = false;
            } else {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = true;
            }
        }
    }

    async removeSelectedTracks() {
        const selectedCheckboxes = document.querySelectorAll('.track-select:checked');
        const playlistId = this.currentPlaylist?.playlist?.ratingKey;
        
        if (!playlistId) {
            this.showToast('Playlist not found', 'error');
            return;
        }

        if (selectedCheckboxes.length === 0) {
            this.showToast('No tracks selected', 'error');
            return;
        }

        const trackCount = selectedCheckboxes.length;
        const confirmed = await this.showConfirmModal(
            `Are you sure you want to remove ${trackCount} track${trackCount > 1 ? 's' : ''} from this playlist?`,
            { title: 'Remove Tracks', confirmText: 'Remove', danger: true }
        );
        if (!confirmed) {
            return;
        }

        // Collect playlist item IDs
        const playlistItemIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.playlistItemId);
        
        // Disable the remove button and show loading state
        const removeSelectedBtn = document.getElementById('removeSelectedBtn');
        const originalBtnContent = removeSelectedBtn.innerHTML;
        removeSelectedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Removing...';
        removeSelectedBtn.disabled = true;

        // Mark all selected items as removing
        playlistItemIds.forEach(id => {
            const trackItem = document.querySelector(`.track-item[data-playlist-item-id="${id}"]`);
            if (trackItem) {
                trackItem.classList.add('removing');
            }
        });

        let successCount = 0;
        let failCount = 0;

        // Remove tracks one by one (could be optimized with a batch API endpoint)
        for (const playlistItemId of playlistItemIds) {
            try {
                const response = await fetch(`/api/playlists/${playlistId}/tracks/${playlistItemId}`, {
                    method: 'DELETE',
                });

                if (response.ok) {
                    successCount++;
                    // Animate removal
                    const trackItem = document.querySelector(`.track-item[data-playlist-item-id="${playlistItemId}"]`);
                    if (trackItem) {
                        trackItem.style.transition = 'all 0.3s ease';
                        trackItem.style.transform = 'translateX(-100%)';
                        trackItem.style.opacity = '0';
                        setTimeout(() => trackItem.remove(), 300);
                    }
                } else {
                    failCount++;
                    const trackItem = document.querySelector(`.track-item[data-playlist-item-id="${playlistItemId}"]`);
                    if (trackItem) {
                        trackItem.classList.remove('removing');
                    }
                }
            } catch (error) {
                failCount++;
                const trackItem = document.querySelector(`.track-item[data-playlist-item-id="${playlistItemId}"]`);
                if (trackItem) {
                    trackItem.classList.remove('removing');
                }
            }
        }

        // Restore button state
        removeSelectedBtn.innerHTML = originalBtnContent;
        removeSelectedBtn.disabled = false;

        // Update selection state after a short delay to let animations complete
        setTimeout(() => {
            this.updateSelectionCount();
            this.updateSelectAllState();
            
            // Uncheck select all
            const selectAllCheckbox = document.getElementById('selectAllTracks');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            }
        }, 350);

        // Show result toast
        if (failCount === 0) {
            this.showToast(`Successfully removed ${successCount} track${successCount > 1 ? 's' : ''}!`, 'success');
        } else if (successCount === 0) {
            this.showToast(`Failed to remove tracks`, 'error');
        } else {
            this.showToast(`Removed ${successCount} track${successCount > 1 ? 's' : ''}, ${failCount} failed`, 'warning');
        }
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    showConfirmModal(message, options = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmModalTitle');
            const messageEl = document.getElementById('confirmModalMessage');
            const iconEl = document.getElementById('confirmModalIcon');
            const confirmBtn = document.getElementById('confirmModalConfirm');
            const cancelBtn = document.getElementById('confirmModalCancel');
            const closeBtn = document.getElementById('confirmModalClose');
            
            // Set content
            titleEl.textContent = options.title || 'Confirm';
            messageEl.textContent = message;
            confirmBtn.textContent = options.confirmText || 'Confirm';
            cancelBtn.textContent = options.cancelText || 'Cancel';
            
            // Set icon style
            iconEl.className = 'fas fa-exclamation-triangle confirm-modal-icon';
            if (options.danger) {
                iconEl.classList.add('danger');
            }
            
            // Set confirm button style
            confirmBtn.className = options.danger ? 'btn btn-danger' : 'btn btn-primary';
            
            // Clean up previous listeners
            const newConfirmBtn = confirmBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);
            const newCloseBtn = closeBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            
            // Add new listeners
            newConfirmBtn.addEventListener('click', () => {
                this.hideModal('confirmModal');
                resolve(true);
            });
            
            newCancelBtn.addEventListener('click', () => {
                this.hideModal('confirmModal');
                resolve(false);
            });
            
            newCloseBtn.addEventListener('click', () => {
                this.hideModal('confirmModal');
                resolve(false);
            });
            
            // Show modal
            this.showModal('confirmModal');
        });
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const messageEl = document.getElementById('toastMessage');
        
        messageEl.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            this.hideToast();
        }, 5000);
    }

    hideToast() {
        document.getElementById('toast').classList.remove('show');
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m ${seconds % 60}s`;
        }
    }

    async loadLogs() {
        const container = document.getElementById('logsContent');
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading logs...</div>';

        try {
            const response = await fetch('/api/logs?lines=200');
            const data = await response.json();

            if (response.ok) {
                this.renderLogs(data.logs);
            } else {
                container.innerHTML = `<div class="error">Error loading logs: ${data.error}</div>`;
            }
        } catch (error) {
            container.innerHTML = `<div class="error">Error loading logs: ${error.message}</div>`;
        }
    }

    renderLogs(logs) {
        const container = document.getElementById('logsContent');
        
        if (logs.length === 0) {
            container.innerHTML = '<div class="empty-state">No logs available.</div>';
            return;
        }

        this.allLogs = logs;
        this.filterLogs();
    }

    filterLogs() {
        if (!this.allLogs) return;

        const levelFilter = document.getElementById('logLevelFilter').value;
        const searchFilter = document.getElementById('logSearchFilter').value.toLowerCase();
        const container = document.getElementById('logsContent');

        let filteredLogs = this.allLogs;

        if (levelFilter) {
            filteredLogs = filteredLogs.filter(log => 
                log.toLowerCase().includes(`[${levelFilter.toUpperCase()}]`)
            );
        }

        if (searchFilter) {
            filteredLogs = filteredLogs.filter(log => 
                log.toLowerCase().includes(searchFilter)
            );
        }

        if (filteredLogs.length === 0) {
            container.innerHTML = '<div class="empty-state">No logs match the current filters.</div>';
            return;
        }

        container.innerHTML = filteredLogs.map(log => {
            const logLevel = this.extractLogLevel(log);
            return `<div class="log-entry ${logLevel}">${this.escapeHtml(log)}</div>`;
        }).join('');

        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    extractLogLevel(logLine) {
        if (logLine.includes('[ERROR]')) return 'error';
        if (logLine.includes('[WARN]')) return 'warn';
        if (logLine.includes('[INFO]')) return 'info';
        if (logLine.includes('[DEBUG]')) return 'debug';
        return 'info';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async clearLogs() {
        const confirmed = await this.showConfirmModal(
            'Are you sure you want to clear all logs?',
            { title: 'Clear Logs', confirmText: 'Clear', danger: true }
        );
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch('/api/logs/clear', {
                method: 'POST'
            });

            const result = await response.json();

            if (response.ok) {
                this.showToast('Logs cleared successfully', 'success');
                this.loadLogs();
            } else {
                this.showToast('Failed to clear logs: ' + result.error, 'error');
            }
        } catch (error) {
            this.showToast('Failed to clear logs: ' + error.message, 'error');
        }
    }
}

const app = new PlexPlaylistManager();