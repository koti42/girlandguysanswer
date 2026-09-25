import React from 'react';

/**
 * Anlık arama sonuçları açılır kutusu.
 *
 * Header'ın içinde `renderSearchDropdownContent` adlı bir kapanış olarak
 * duruyordu; masaüstü ve mobil menüde iki kez çağrılıyor, çevresindeki yedi
 * ayrı state'e doğrudan uzanıyordu. Dışarı alındı: bağımlılıklar artık props.
 */
const SearchDropdown = ({
    isSearching,
    searchQuery,
    userResults,
    searchResults,
    onUserClick,
    onResultClick,
    onFullSearch,
}) => {
    if (isSearching) {
        return (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-coral border-t-transparent mx-auto mb-2"></div>
                Aranıyor...
            </div>
        );
    }

    const hasResults = userResults.length > 0 || searchResults.length > 0;

    if (!hasResults) {
        return (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                <p className="text-sm">"{searchQuery}" ile ilgili sonuç bulunamadı.</p>
            </div>
        );
    }

    return (
        <>
            {userResults.length > 0 && (
                <div className="py-2 border-b border-gray-100 dark:border-gray-700">
                    <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Kullanıcılar</p>
                    {userResults.map((u) => (
                        <div
                            key={`user-${u.id}`}
                            onClick={() => onUserClick(u.username)}
                            className="group px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer flex items-center gap-3 transition-all"
                        >
                            <UserAvatar user={u} size="md" className="w-9 h-9 border-2 border-white dark:border-gray-600 shadow-sm group-hover:border-coral/50 transition-colors" />
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate group-hover:text-coral transition-colors">
                                    @{u.username}
                                </p>
                                {u.bio && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{u.bio}</p>
                                )}
                            </div>
                            <FaUser className="text-xs text-gray-300 group-hover:text-coral transition-colors" />
                        </div>
                    ))}
                </div>
            )}

            {searchResults.length > 0 && (
                <div className="py-2">
                    {searchResults.map((result) => (
                        <div
                            key={result.id}
                            onClick={() => onResultClick(result.slug)}
                            className="group px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer flex items-center gap-4 transition-all border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                        >
                            <div className="shrink-0">
                                {result.user ? (
                                    <UserAvatar user={result.user} size="md" className="w-10 h-10 border-2 border-white dark:border-gray-600 shadow-sm group-hover:border-coral/50 transition-colors" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
                                        <FaSearch />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate group-hover:text-coral transition-colors">
                                    {result.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                        {typeof result.category === 'object' ? result.category?.name : result.category}
                                    </span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex items-center gap-1">
                                        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                                        @{result.user?.username || 'anonim'}
                                    </span>
                                </div>
                            </div>
                            <div className="text-gray-300 group-hover:text-coral transition-colors">
                                <FaChevronRight className="text-xs" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div onClick={onFullSearch} className="bg-gray-50 dark:bg-gray-700/30 p-3 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-100 dark:border-gray-700">
                <span className="text-sm font-bold text-coral flex items-center justify-center gap-2">
                    Tüm "{searchQuery}" sonuçlarını gör
                </span>
            </div>
        </>
    );
};

export default SearchDropdown;
