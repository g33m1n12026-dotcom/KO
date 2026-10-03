import JSZip from 'jszip';

export function getMetaLua(): string {
  return `local _ = require("gettext")

return {
    name = "aibooks",
    fullname = _("AI Książki, Komiksy i Tłumacz"),
    description = _("Chmurowy konwerter PDF do lekkiego EPUB/CBZ oraz literacki tłumacz AI dla Kindle."),
    category = "tools",
}
`;
}

export function getMainLua(defaultServerUrl: string = 'https://ko-zviz.onrender.com'): string {
  return `--[[
    KOReader Plugin: aibooks.koplugin
    AI Cloud Translator & PDF/Comic Optimizer for Kindle 10
    Odciąża procesor i 512 MB RAM czytnika, przenosząc parsowanie, OCR i tłumaczenie do chmury.
--]]

local Device = require("device")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")
local InputDialog = require("ui/widget/inputdialog")
local Menu = require("ui/widget/menu")
local ConfirmBox = require("ui/widget/confirmbox")
local DataStorage = require("datastorage")
local http = require("socket.http")
local https = pcall(require, "ssl.https") and require("ssl.https") or nil
local socketurl = pcall(require, "socket.url") and require("socket.url") or nil
local ltn12 = require("ltn12")
local json = pcall(require, "json") and require("json") or (pcall(require, "rapidjson") and require("rapidjson") or nil)
local logger = require("logger")
local _ = require("gettext")

-- Menedżer sieci KOReader (zapobiega zawieszaniu przy uśpionym Wi-Fi)
local has_network_mgr, NetworkMgr = pcall(require, "ui/network/manager")

-- Bezpieczne limity czasowe na gniazdach sieciowych (zoptymalizowane pod e-ink, aby czytnik nigdy nie wisiał)
http.TIMEOUT = 8

-- Bezpieczne kodowanie parametrow zapytania URL
local function urlEncode(str)
    if socketurl and socketurl.escape then
        return socketurl.escape(str)
    end
    if not str then return "" end
    return (string.gsub(str, "([^%w%-%._~])", function(c)
        return string.format("%%%02X", string.byte(c))
    end))
end

-- Bezpieczny dyspozytor zapytan HTTP/HTTPS dla KOReadera z automatycznym naglowkiem tunelu i obsluga przekierowan
local function doHttpRequest(req, max_redirects)
    max_redirects = max_redirects or 3
    if not req.headers then req.headers = {} end
    -- Pomin ekrany ostrzegawcze LocalTunnel / Ngrok
    req.headers["bypass-tunnel-reminder"] = "1"
    req.headers["User-Agent"] = "KOReader-AIBooks/2.0 (Kindle)"

    -- Ustawienia TLS/SSL zoptymalizowane pod e-ink Kindle (bez zacinania na sprawdzaniu CA)
    req.protocol = "any"
    req.options = "all"
    req.verify = "none"

    local socketutil = pcall(require, "socketutil") and require("socketutil") or nil
    if socketutil and socketutil.set_timeout then
        socketutil:set_timeout(socketutil.FILE_BLOCK_TIMEOUT or 10, socketutil.LARGE_TOTAL_TIMEOUT or 30)
    end

    local res, code, headers, status
    local ok, err = pcall(function()
        if req.url and req.url:match("^https://") then
            if https then
                res, code, headers, status = https.request(req)
            else
                local ssl_ok, ssl_module = pcall(require, "ssl.https")
                if ssl_ok and ssl_module then
                    res, code, headers, status = ssl_module.request(req)
                else
                    res, code, headers, status = http.request(req)
                end
            end
        else
            res, code, headers, status = http.request(req)
        end
    end)

    if socketutil and socketutil.reset_timeout then
        socketutil:reset_timeout()
    end

    if not ok then
        return nil, 0, {}, tostring(err)
    end

    -- Obsluga przekierowan (301, 302, 307, 308)
    if (code == 301 or code == 302 or code == 307 or code == 308) and headers and headers.location and max_redirects > 0 then
        local loc = headers.location
        if loc:match("__cookie_check") or loc:match("accounts%.google") then
            return nil, 302, headers, "AUTH_REDIRECT_REQUIRED"
        end

        local next_url = loc
        if not next_url:match("^https?://") then
            local prefix = req.url:match("^(https?://[^/]+)") or ""
            next_url = prefix .. next_url
        end
        req.url = next_url
        return doHttpRequest(req, max_redirects - 1)
    end

    return res, code, headers, status
end

local AIBooks = WidgetContainer:extend{
    name = "aibooks",
    server_url = "${defaultServerUrl}",
    target_folder = "/mnt/us/documents/AI_Books",
}

function AIBooks:init()
    self:loadSettings()
    self:ensureTargetDir()
    self:ensureOpdsCatalog()
end

function AIBooks:ensureTargetDir()
    local ok, lfs = pcall(require, "lfs")
    if ok and lfs and lfs.mkdir then
        pcall(lfs.mkdir, "/mnt/us/documents")
        pcall(lfs.mkdir, self.target_folder)
    else
        os.execute("mkdir -p " .. self.target_folder .. " 2>/dev/null")
    end
end

-- Automatyczna rejestracja katalogu OPDS w ustawieniach KOReadera
function AIBooks:ensureOpdsCatalog()
    local opds_path = DataStorage:getSettingsDir() .. "/opds_servers.lua"
    local servers = {}
    local ok, loaded = pcall(dofile, opds_path)
    if ok and type(loaded) == "table" then
        servers = loaded
    end

    local my_url = self.server_url .. "/opds"
    local exists = false
    for _, s in ipairs(servers) do
        if s.url and (s.url == my_url or s.url:match("/opds$")) then
            exists = true
            s.url = my_url
            s.title = "KOReader AI Cloud (Pobieranie w tle)"
            break
        end
    end

    if not exists then
        table.insert(servers, 1, {
            title = "KOReader AI Cloud (Pobieranie w tle)",
            url = my_url,
        })
    end

    local f = io.open(opds_path, "w")
    if f then
        f:write("return {\\n")
        for _, s in ipairs(servers) do
            f:write("    { title = [[" .. (s.title or "Katalog") .. "]], url = [[" .. (s.url or "") .. "]] },\\n")
        end
        f:write("}\\n")
        f:close()
    end
end

-- Otwieranie wbudowanego katalogu OPDS KOReadera (pobiera w tle z paskiem postępu i nigdy nie zawiesza czytnika)
function AIBooks:openNativeOpds()
    self:ensureOpdsCatalog()
    local opds_url = self.server_url .. "/opds"

    -- 1. Oficjalny dyspozytor akcji KOReadera (uruchamia zarejestrowaną akcję "opds_show_catalog")
    local ok_disp, Dispatcher = pcall(require, "dispatcher")
    if ok_disp and Dispatcher and Dispatcher.execute then
        local ok = pcall(function() Dispatcher:execute("opds_show_catalog") end)
        if ok then return end
    end

    -- 2. Rozesłanie zdarzenia ShowOPDSCatalog do stosu UI KOReadera
    local ok_evt, Event = pcall(require, "ui/event")
    if ok_evt and Event then
        local ok = pcall(function()
            UIManager:broadcastEvent(Event:new("ShowOPDSCatalog"))
        end)
        if ok then return end
    end

    -- 3. Bezpośrednie załadowanie wtyczki opds.koplugin
    local ok_opds, OPDS = pcall(require, "plugins/opds.koplugin/main")
    if not ok_opds or not OPDS then
        ok_opds, OPDS = pcall(dofile, "plugins/opds.koplugin/main.lua")
    end
    if ok_opds and OPDS and OPDS.onShowOPDSCatalog then
        local opds_instance = OPDS:new{ ui = self.ui }
        local ok = pcall(function() opds_instance:onShowOPDSCatalog() end)
        if ok then return end
    end

    -- 4. Bezpośrednie załadowanie przeglądarki opdsbrowser
    local ok_browser, OPDSBrowser = pcall(require, "plugins/opds.koplugin/opdsbrowser")
    if not ok_browser or not OPDSBrowser then
        ok_browser, OPDSBrowser = pcall(dofile, "plugins/opds.koplugin/opdsbrowser.lua")
    end
    if ok_browser and OPDSBrowser and OPDSBrowser.new then
        local ok = pcall(function()
            local browser = OPDSBrowser:new{
                title = "⚡ KOReader AI Cloud",
                servers = {
                    { title = "⚡ KOReader AI Cloud (Pobieranie w tle)", url = opds_url },
                },
                is_popout = false,
                is_borderless = true,
                title_bar_fm_style = true,
            }
            UIManager:show(browser)
        end)
        if ok then return end
    end

    self:showOpdsInfo()
end

-- Asynchroniczny dyspozytor: budzi Wi-Fi bez zamrażania UI i uruchamia akcję w kolejnej klatce
function AIBooks:withNetwork(callback)
    local function run()
        UIManager:nextTick(callback)
    end

    if has_network_mgr and NetworkMgr and NetworkMgr.runWhenConnected then
        NetworkMgr:runWhenConnected(run)
    else
        run()
    end
end

function AIBooks:loadSettings()
    local settings_path = DataStorage:getSettingsDir() .. "/aibooks_settings.lua"
    local f = io.open(settings_path, "r")
    if f then
        f:close()
        local ok, data = pcall(dofile, settings_path)
        if ok and type(data) == "table" and data.server_url and data.server_url ~= "" then
            if not data.server_url:match("ais%-dev") and not data.server_url:match("ais%-pre") then
                self.server_url = data.server_url:gsub("/+$", "")
            end
        end
    end
end

function AIBooks:saveSettings()
    local settings_path = DataStorage:getSettingsDir() .. "/aibooks_settings.lua"
    local f = io.open(settings_path, "w")
    if f then
        f:write("return { server_url = [[" .. self.server_url .. "]] }\\n")
        f:close()
    end
    self:ensureOpdsCatalog()
end

-- Obsluga bledu 302 i problemów sieciowych
function AIBooks:handleHttpError(code, status_message)
    if code == 302 or status_message == "AUTH_REDIRECT_REQUIRED" then
        local confirm = ConfirmBox:new{
            text = _("Błąd autoryzacji serwera (302).\\n\\nAby połączyć czytnik z serwerem AI:\\n1. Otwórz aplikację na komputerze/telefonie\\n2. Kliknij 'Włącz Tunel Kindle' (lub użyj stałego serwera Render)\\n3. Wpisz publiczny adres URL w Ustawieniach wtyczki.\\n\\nCzy chcesz teraz przejść do Ustawień adresu?"),
            ok_text = _("Ustawienia"),
            cancel_text = _("Zamknij"),
            ok_callback = function()
                self:showSettingsDialog()
            end,
        }
        UIManager:show(confirm)
        return
    end

    local err_text = _("Nie udało się połączyć z serwerem AI: ") .. tostring(code or status_message or "brak odpowiedzi") .. _("\\n\\nUpewnij się, że Wi-Fi na Kindle jest włączone, a adres w Ustawieniach jest poprawny.")
    UIManager:show(InfoMessage:new{ text = err_text })
end

-- Hook do Menu Plików w KOReaderze (przytrzymanie palcem na pliku PDF / EPUB / CBZ / TXT)
function AIBooks:onFileHold(file)
    if not file or not file.path then return end
    local ext = file.path:match("%.([^%.]+)$")
    if not ext then return end
    ext = ext:lower()

    if ext == "pdf" or ext == "txt" or ext == "epub" or ext == "mobi" or ext == "cbz" or ext == "cbr" then
        return {
            text = _("📚 AI: Konwertuj / Przetłumacz ten plik"),
            callback = function()
                self:showLocalFileActionDialog(file.path)
            end,
        }
    end
end

-- Dodanie opcji do Menu Głównego KOReadera
function AIBooks:addToMainMenu(menu_items)
    -- Główny wpis w Narzędziach (ikona klucza)
    menu_items.ai_books_main = {
        text = _("📚 AI Książki & Tłumacz"),
        sorting_hint = "tools",
        sub_item_table = {
            {
                text = _("⚡ 1. Katalog OPDS (Pobierz książki)"),
                callback = function() self:openNativeOpds() end,
            },
            {
                text = _("🔍 2. Szukaj książki w sieci"),
                callback = function() self:showSearchDialog() end,
            },
            {
                text = _("⏳ 3. Zadania w toku & Status"),
                callback = function() self:showTasksList() end,
            },
            {
                text = _("💡 4. Doradca AI"),
                callback = function() self:showRecommendDialog() end,
            },
            {
                text = _("📄 5. Przetłumacz plik z czytnika"),
                callback = function() self:showLocalFilesDialog() end,
            },
            {
                text = _("✨ 6. Książka na życzenie (Storybook)"),
                callback = function() self:showStorybookDialog() end,
            },
            {
                text = _("⚙️ 7. Ustawienia serwera"),
                callback = function() self:showSettingsDialog() end,
            },
            {
                text = _("📱 Kod QR do przeglądarki"),
                callback = function() self:showMobileQRCode() end,
            },
        },
    }

    -- Skróty pod Lupką (Wyszukiwanie) - czyste i czytelne
    menu_items.ai_books_opds_quick = {
        text = _("⚡ Katalog OPDS"),
        sorting_hint = "search",
        callback = function() self:openNativeOpds() end,
    }
    menu_items.ai_books_search_quick = {
        text = _("🔍 Szukaj książki w sieci"),
        sorting_hint = "search",
        callback = function() self:showSearchDialog() end,
    }
    menu_items.ai_books_tasks_quick = {
        text = _("⏳ Zadania w toku"),
        sorting_hint = "search",
        callback = function() self:showTasksList() end,
    }
    menu_items.ai_books_advisor_quick = {
        text = _("💡 Doradca AI"),
        sorting_hint = "search",
        callback = function() self:showRecommendDialog() end,
    }
end

-- Informacja o katalogu OPDS
function AIBooks:showOpdsInfo()
    local opds_url = self.server_url .. "/opds"
    local info = InfoMessage:new{
        text = _("⚡ Wbudowany katalog OPDS KOReadera:\\n\\n") .. opds_url .. _("\\n\\nKatalog OPDS pobiera książki w tle z paskiem postępu!\\n\\nAby dodać:\\n1. W KOReaderze dotknij Lupki (Szukaj)\\n2. Wybierz 'Katalogi OPDS' ➔ 'Dodaj nowy katalog'\\n3. Wpisz powyższy adres URL."),
    }
    UIManager:show(info)
end

-- Przeglądarka plików lokalnych w czytniku (/mnt/us/documents)
function AIBooks:showLocalFilesDialog(dir_path)
    dir_path = dir_path or "/mnt/us/documents"
    local ok, lfs = pcall(require, "lfs")
    local items = {}

    if dir_path ~= "/mnt/us" and dir_path ~= "/mnt/us/documents" then
        local parent = dir_path:match("(.+)/[^/]+$") or "/mnt/us/documents"
        table.insert(items, {
            text = "📁 .. (" .. _("W górę") .. ")",
            callback = function()
                self:showLocalFilesDialog(parent)
            end,
        })
    end

    local entries = {}
    if ok and lfs and lfs.dir then
        for entry in lfs.dir(dir_path) do
            if entry ~= "." and entry ~= ".." and not entry:match("^%.") then
                local full = dir_path .. "/" .. entry
                local mode = lfs.attributes(full, "mode")
                table.insert(entries, { name = entry, path = full, mode = mode })
            end
        end
        table.sort(entries, function(a, b)
            if a.mode == "directory" and b.mode ~= "directory" then return true end
            if a.mode ~= "directory" and b.mode == "directory" then return false end
            return a.name:lower() < b.name:lower()
        end)
    end

    for _, e in ipairs(entries) do
        if e.mode == "directory" then
            table.insert(items, {
                text = "📁 " .. e.name .. "/",
                callback = function()
                    self:showLocalFilesDialog(e.path)
                end,
            })
        else
            local ext = e.name:match("%.([^%.]+)$")
            if ext then ext = ext:lower() end
            if ext == "pdf" or ext == "epub" or ext == "txt" or ext == "mobi" or ext == "cbz" or ext == "cbr" then
                table.insert(items, {
                    text = "📄 " .. e.name,
                    callback = function()
                        self:showLocalFileActionDialog(e.path)
                    end,
                })
            end
        end
    end

    table.insert(items, {
        text = _("❌ Zamknij / Wróć"),
        callback = function() end,
    })

    local menu = Menu:new{
        title = _("Wybierz plik z czytnika:") .. " " .. dir_path:gsub("^/mnt/us/", ""),
        item_table = items,
    }
    UIManager:show(menu)
end

-- Okno wyboru akcji dla wybranego pliku (Tłumaczenie, Lekki EPUB, Komiks CBZ)
function AIBooks:showLocalFileActionDialog(filePath)
    local filename = filePath:match("([^/]+)$") or filePath
    local ext = filename:match("%.([^%.]+)$")
    if ext then ext = ext:lower() end

    local items = {
        {
            text = _("🌐 1. Przetłumacz na polski i stwórz EPUB\\n(Tłumaczenie literackie AI, rozdziały, spis treści)"),
            callback = function()
                self:uploadFileForProcessing(filePath, "translate")
            end,
        },
        {
            text = _("📖 2. Przerób na lekki EPUB (bez tłumaczenia)\\n(Idealne na ciężkie skany PDF: płynny tekst, skalowanie czcionki)"),
            callback = function()
                self:uploadFileForProcessing(filePath, "epub_clean")
            end,
        },
    }

    if ext == "pdf" or ext == "cbz" or ext == "cbr" or ext == "zip" then
        table.insert(items, {
            text = _("🎨 3. Konwertuj na format komiksowy (CBZ)\\n(Dla komiksów i mangi: natychmiastowe strony pod e-ink bez zacinania)"),
            callback = function()
                self:uploadFileForProcessing(filePath, "comic_cbz")
            end,
        })
    end

    table.insert(items, {
        text = _("❌ Anuluj / Zamknij"),
        callback = function() end,
    })

    local menu = Menu:new{
        title = _("Plik: ") .. filename:sub(1, 35) .. _("\\nWybierz tryb przetwarzania w chmurze:"),
        item_table = items,
    }
    UIManager:show(menu)
end

-- Książka na życzenie (AI Storybook / Poradnik)
function AIBooks:showStorybookDialog()
    local input
    input = InputDialog:new{
        title = _("✨ Książka na życzenie (AI Storybook)"),
        input_hint = _("Wpisz temat, fabułę lub tytuł..."),
        description = _("Opisz o czym ma być książka (powieść, streszczenie lub poradnik):"),
        buttons = {
            {
                {
                    text = _("Anuluj"),
                    id = "close",
                    callback = function()
                        UIManager:close(input)
                    end,
                },
                {
                    text = _("Stwórz książkę"),
                    is_enter_default = true,
                    callback = function()
                        local prompt = input:getInputText()
                        UIManager:close(input)
                        if prompt and prompt:gsub("%s+", "") ~= "" then
                            self:withNetwork(function()
                                self:performStorybookCreation(prompt)
                            end)
                        end
                    end,
                },
            },
        },
    }
    UIManager:show(input)
    if input.onShowKeyboard then input:onShowKeyboard() end
end

function AIBooks:performStorybookCreation(promptText)
    local info = InfoMessage:new{ text = _("Zlecanie tworzenia książki w chmurze AI...") }
    UIManager:show(info)

    UIManager:nextTick(function()
        local payload = json.encode({
            prompt = promptText,
            type = "story",
            chapterCount = 4,
            includeIllustrations = true,
            engine = "auto",
        })

        local response_body = {}
        local res, code, headers, status = doHttpRequest{
            url = self.server_url .. "/api/koreader/storybook/create",
            method = "POST",
            headers = {
                ["Content-Type"] = "application/json",
                ["Content-Length"] = tostring(#payload),
            },
            source = ltn12.source.string(payload),
            sink = ltn12.sink.table(response_body),
        }

        UIManager:close(info)

        if code == 200 or code == 201 then
            UIManager:show(InfoMessage:new{
                text = _("✅ Zlecenie przyjęte!\\n\\nAI pisze Twoją książkę rozdział po rozdziale i generuje ryciny.\\n\\nPostęp możesz śledzić w menu 'Moje zadania'. Po ukończeniu pobierzesz ją bezpośrednio do folderu AI_Books na czytniku."),
            })
        else
            self:handleHttpError(code, status)
        end
    end)
end

-- Doradca AI na bazie opisu czytelnika
function AIBooks:showRecommendDialog()
    local input
    input = InputDialog:new{
        title = _("Doradca AI: Opisz na co masz ochotę"),
        input_hint = _("np. cyberpunk z filozofią, mroczny kryminał noir..."),
        description = _("Opisz nastrój, motywy lub temat:"),
        buttons = {
            {
                {
                    text = _("Anuluj"),
                    id = "close",
                    callback = function()
                        UIManager:close(input)
                    end,
                },
                {
                    text = _("Zaproponuj"),
                    is_enter_default = true,
                    callback = function()
                        local desc = input:getInputText()
                        UIManager:close(input)
                        if desc and desc:gsub("%s+", "") ~= "" then
                            self:withNetwork(function()
                                self:performRecommendation(desc)
                            end)
                        end
                    end,
                },
            },
        },
    }
    UIManager:show(input)
    if input.onShowKeyboard then input:onShowKeyboard() end
end

function AIBooks:performRecommendation(description)
    local info = InfoMessage:new{ text = _("AI analizuje motywy i dobiera książki w chmurze...") }
    UIManager:show(info)

    UIManager:nextTick(function()
        local payload = json.encode({
            description = description,
            engine = "auto",
        })

        local response_body = {}
        local res, code, headers, status = doHttpRequest{
            url = self.server_url .. "/api/koreader/recommend",
            method = "POST",
            headers = {
                ["Content-Type"] = "application/json",
                ["Content-Length"] = tostring(#payload),
            },
            source = ltn12.source.string(payload),
            sink = ltn12.sink.table(response_body),
        }

        UIManager:close(info)

        if code ~= 200 then
            self:handleHttpError(code, status)
            return
        end

        local raw = table.concat(response_body)
        local ok, data = pcall(json.decode, raw)
        if not ok or not data or not data.recommendations or #data.recommendations == 0 then
            UIManager:show(InfoMessage:new{ text = _("Brak propozycji dla tego opisu. Spróbuj innych słów kluczowych.") })
            return
        end

        local menu_items = {}
        for _, item in ipairs(data.recommendations) do
            local titleDisplay = item.title
            if item.polishTitle and item.polishTitle ~= "" then
                titleDisplay = item.polishTitle .. " (" .. item.title .. ")"
            end
            local isPolish = (item.originalLang == "PL" or item.isPolishAvailable or item.language == "PL")
            local langBadge = isPolish and "🇵🇱 [PL - Język polski]" or ("🌐 [" .. (item.originalLang or "Obcy") .. " - Wymaga przekładu]")
            local label = langBadge .. " " .. titleDisplay .. "\\nAutor: " .. (item.author or "Brak") .. " • " .. (item.genre or "")
            local hint = "💡 " .. (item.matchReason or item.synopsis or "")

            table.insert(menu_items, {
                text = label .. "\\n" .. hint,
                callback = function()
                    self:showAdvisorActionDialog(item, isPolish)
                end,
            })
        end

        table.insert(menu_items, {
            text = _("❌ Zamknij / Wróć"),
            callback = function() end,
        })

        local menu = Menu:new{
            title = _("Propozycje AI (Język polski w pierwszej kolejności):"),
            item_table = menu_items,
        }
        UIManager:show(menu)
    end)
end

-- Menu akcji dla wybranej rekomendacji od Doradcy AI
function AIBooks:showAdvisorActionDialog(item, isPolish)
    local titleDisplay = item.polishTitle or item.title
    local actions = {}

    if isPolish then
        table.insert(actions, {
            text = _("📥 1. Pobierz od razu (Polskie wydanie)\\n[🇵🇱 Język polski - Gotowe do czytania bez tłumaczenia]"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing({
                        title = item.polishTitle or item.title,
                        author = item.author,
                        language = "PL",
                        downloadUrl = item.downloadUrl or "auto",
                        searchQuery = item.searchQuery,
                    }, "original")
                end)
            end,
        })
        table.insert(actions, {
            text = _("🔍 2. Przejrzyj inne źródła w wyszukiwarce\\n(Sprawdź Chomikuj, Wolne Lektury, Z-Library i wybierz format)"),
            callback = function()
                self:withNetwork(function()
                    self:performSearch(item.searchQuery or (item.author .. " " .. (item.polishTitle or item.title)))
                end)
            end,
        })
    else
        table.insert(actions, {
            text = _("🌐 1. Pobierz i przetłumacz na polski (Przekład AI)\\n[Język obcy: " .. (item.originalLang or "EN") .. " - Literacki przekład AI na polski]"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing({
                        title = item.title,
                        author = item.author,
                        language = item.originalLang or "EN",
                        downloadUrl = item.downloadUrl or "auto",
                        searchQuery = item.searchQuery,
                    }, "translate")
                end)
            end,
        })
        table.insert(actions, {
            text = _("🔍 2. Szukaj polskiego wydania w wyszukiwarce\\n(Sprawdź czy w innych źródłach jest wersja po polsku)"),
            callback = function()
                self:withNetwork(function()
                    self:performSearch(item.searchQuery or (item.author .. " " .. (item.polishTitle or item.title)))
                end)
            end,
        })
        table.insert(actions, {
            text = _("📥 3. Pobierz oryginał w j. obcym (bez tłumaczenia)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing({
                        title = item.title,
                        author = item.author,
                        language = item.originalLang or "EN",
                        downloadUrl = item.downloadUrl or "auto",
                        searchQuery = item.searchQuery,
                    }, "original")
                end)
            end,
        })
    end

    table.insert(actions, {
        text = _("📄 Konwertuj na lekki EPUB (gdy plik to PDF)\\n(Przystosowuje skan/PDF do e-inku ze skalowaniem czcionki)"),
        callback = function()
            self:withNetwork(function()
                self:orderBookProcessing({
                    title = item.polishTitle or item.title,
                    author = item.author,
                    language = isPolish and "PL" or (item.originalLang or "EN"),
                    downloadUrl = item.downloadUrl or "auto",
                    searchQuery = item.searchQuery,
                }, "epub_clean")
            end)
        end,
    })

    table.insert(actions, {
        text = _("ℹ️ Zarys fabuły & Dlaczego warto przeczytać"),
        callback = function()
            local desc = (item.synopsis and item.synopsis ~= "" and (item.synopsis .. "\\n\\n") or "") .. "🎯 Dopasowanie: " .. (item.matchReason or "Polecana pozycja.")
            UIManager:show(InfoMessage:new{ text = desc })
        end,
    })

    table.insert(actions, {
        text = _("❌ Wróć do listy propozycji"),
        callback = function() end,
    })

    local menu = Menu:new{
        title = titleDisplay:sub(1, 35) .. (isPolish and " [PL]" or " [Obcy]"),
        item_table = actions,
    }
    UIManager:show(menu)
end

-- Wyszukiwarka książek w Internecie
function AIBooks:showSearchDialog()
    local input
    input = InputDialog:new{
        title = _("Wyszukaj książkę w sieci"),
        input_hint = _("np. Lem Solaris, Wiedźmin, Frankenstein..."),
        description = _("Wpisz tytuł lub autora:"),
        buttons = {
            {
                {
                    text = _("Anuluj"),
                    id = "close",
                    callback = function()
                        UIManager:close(input)
                    end,
                },
                {
                    text = _("Szukaj"),
                    is_enter_default = true,
                    callback = function()
                        local query = input:getInputText()
                        UIManager:close(input)
                        if query and query:gsub("%s+", "") ~= "" then
                            self:withNetwork(function()
                                self:performSearch(query)
                            end)
                        end
                    end,
                },
            },
        },
    }
    UIManager:show(input)
    if input.onShowKeyboard then input:onShowKeyboard() end
end

function AIBooks:performSearch(query)
    local info = InfoMessage:new{ text = _("Wyszukiwanie książek w chmurze...") }
    UIManager:show(info)

    UIManager:nextTick(function()
        local url = self.server_url .. "/api/koreader/search?q=" .. urlEncode(query)
        local response_body = {}
        local res, code, headers, status = doHttpRequest{
            url = url,
            method = "GET",
            sink = ltn12.sink.table(response_body),
        }

        UIManager:close(info)

        if code ~= 200 then
            self:handleHttpError(code, status)
            return
        end

        local raw = table.concat(response_body)
        local ok, results = pcall(json.decode, raw)
        if not ok or not results or #results == 0 then
            UIManager:show(InfoMessage:new{ text = _("Nie znaleziono książek dla zapytania: ") .. query })
            return
        end

        local menu_items = {}
        for _, item in ipairs(results) do
            local title = item.title or "Bez tytułu"
            local author = item.author or "Autor nieznany"
            local format = (item.format or "epub"):lower()
            local titleLower = title:lower()
            local downloadUrl = (item.downloadUrl or ""):lower()

            -- Precyzyjne rozpoznanie typu: paczka ZIP, komiks/manga, książka EPUB/MOBI, PDF
            local typeTag = "📚 [EPUB]"
            if format == "zip" or titleLower:match("%.zip") or titleLower:match("archive") or titleLower:match("paczka") or downloadUrl:match("%.zip") then
                typeTag = "📦 [PACZKA ZIP]"
            elseif titleLower:match("komiks") or titleLower:match("manga") or titleLower:match("graphic") or format == "cbz" or format == "cbr" or downloadUrl:match("komiks") then
                typeTag = "🎨 [KOMIKS]"
            elseif format == "pdf" or titleLower:match("%.pdf") then
                typeTag = "📄 [PDF]"
            elseif format == "mobi" or format == "azw3" then
                typeTag = "📚 [MOBI]"
            end

            local sizeInfo = (item.fileSize and item.fileSize ~= "") and (" • " .. item.fileSize) or ""
            local sourceInfo = item.source or "Chomikuj / Sieć"
            local langInfo = item.language or "PL"

            local label = typeTag .. " " .. title:sub(1, 42)
            local sub = "Autor: " .. author:sub(1, 28) .. "\\n" .. "[" .. langInfo .. "] " .. sourceInfo .. sizeInfo

            table.insert(menu_items, {
                text = label .. "\\n" .. sub,
                callback = function()
                    self:showBookActionDialog(item)
                end,
            })
        end

        table.insert(menu_items, {
            text = _("❌ Zamknij / Wróć"),
            callback = function() end,
        })

        local menu = Menu:new{
            title = _("Znalezione pozycje (Wybierz książkę):"),
            item_table = menu_items,
        }
        UIManager:show(menu)
    end)
end



-- Dialog decyzyjny dla wybranej książki (Konwersja TYLKO w razie potrzeby)
function AIBooks:showBookActionDialog(item)
    local title = item.title or "Książka"
    local titleLower = title:lower()
    local format = (item.format or "epub"):lower()
    local isZip = format == "zip" or titleLower:match("%.zip") or titleLower:match("archive") or (item.downloadUrl or ""):lower():match("%.zip")
    local isComic = titleLower:match("komiks") or titleLower:match("manga") or format == "cbz"
    local isPdf = format == "pdf" or titleLower:match("%.pdf")
    local isEpubOrMobi = format == "epub" or format == "mobi" or format == "azw3"

    local actions = {}

    if isEpubOrMobi then
        -- Książka jest już lekkim e-bookiem – nie wymaga żadnej konwersji!
        table.insert(actions, {
            text = _("⚡ 1. Pobierz od razu (Gotowy e-book – bez zbędnej konwersji)\\n(Plik jest już lekki i natychmiast gotowy do czytania w KOReaderze)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "original")
                end)
            end,
        })
        table.insert(actions, {
            text = _("🌐 2. Przetłumacz na polski (tylko w razie potrzeby, np. obcy język)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "translate")
                end)
            end,
        })
    elseif isZip then
        -- Paczka ZIP – serwer w chmurze tylko wyciąga gotowy e-book, bez zbędnego mielenia
        table.insert(actions, {
            text = _("⚡ 1. Rozpakuj w chmurze i pobierz e-book (bez zbędnej konwersji)\\n(Serwer wyjmuje gotowy EPUB z paczki i przesyła go na czytnik)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "original")
                end)
            end,
        })
        table.insert(actions, {
            text = _("🌐 2. Rozpakuj w chmurze i przetłumacz na polski"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "translate")
                end)
            end,
        })
    elseif isPdf then
        -- Plik PDF – tutaj konwersja jest przydatna, bo PDF na e-inku jest ciężki i nie skaluje czcionki
        table.insert(actions, {
            text = _("📖 1. Konwertuj PDF na lekki EPUB (zalecane dla e-ink)\\n(Umożliwia zmianę czcionki i płynne czytanie bez zacinania)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "epub_clean")
                end)
            end,
        })
        table.insert(actions, {
            text = _("🌐 2. Konwertuj PDF i przetłumacz na polski (przekład AI)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "translate")
                end)
            end,
        })
        table.insert(actions, {
            text = _("📦 3. Pobierz surowy PDF (bez konwersji)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "original")
                end)
            end,
        })
    elseif isComic then
        table.insert(actions, {
            text = _("🎨 1. Przygotuj komiks CBZ (zoptymalizowany pod ekran Kindle)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "comic_cbz")
                end)
            end,
        })
        table.insert(actions, {
            text = _("📦 2. Pobierz oryginał (bez konwersji)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "original")
                end)
            end,
        })
    else
        table.insert(actions, {
            text = _("⚡ 1. Pobierz oryginał (bez konwersji)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "original")
                end)
            end,
        })
        table.insert(actions, {
            text = _("📖 2. Przerób na lekki EPUB (w razie potrzeby)"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "epub_clean")
                end)
            end,
        })
        table.insert(actions, {
            text = _("🌐 3. Przetłumacz na polski"),
            callback = function()
                self:withNetwork(function()
                    self:orderBookProcessing(item, "translate")
                end)
            end,
        })
    end

    table.insert(actions, {
        text = _("❌ Anuluj"),
        callback = function() end,
    })

    local menu = Menu:new{
        title = _("Wybór dla: ") .. title:sub(1, 35),
        item_table = actions,
    }
    UIManager:show(menu)
end

function AIBooks:orderBookProcessing(item, conversionMode)
    local info = InfoMessage:new{ text = _("Wysyłanie zlecenia do chmury AI...") }
    UIManager:show(info)

    local dUrl = item.downloadUrl
    if (not dUrl or dUrl == "" or dUrl == "nil") and item.availableSources and #item.availableSources > 0 then
        for _, src in ipairs(item.availableSources) do
            if src.downloadUrl and src.downloadUrl ~= "" and src.downloadUrl ~= "nil" then
                dUrl = src.downloadUrl
                break
            end
        end
    end
    if not dUrl or dUrl == "" or dUrl == "nil" then
        dUrl = "auto"
    end

    UIManager:nextTick(function()
        local payload = json.encode({
            title = item.title,
            downloadUrl = dUrl,
            engine = "auto",
            targetLang = conversionMode == "translate" and "Polish" or "none",
            conversionMode = conversionMode,
        })

        local response_body = {}
        local res, code, headers, status = doHttpRequest{
            url = self.server_url .. "/api/koreader/order",
            method = "POST",
            headers = {
                ["Content-Type"] = "application/json",
                ["Content-Length"] = tostring(#payload),
            },
            source = ltn12.source.string(payload),
            sink = ltn12.sink.table(response_body),
        }

        UIManager:close(info)

        if code == 200 or code == 201 then
            UIManager:show(InfoMessage:new{
                text = _("✅ Zlecenie przyjęte przez serwer w chmurze!\\nPostęp sprawdzisz w 'Moje zadania'."),
            })
        else
            self:handleHttpError(code, status)
        end
    end)
end

-- Przesyłanie pliku z czytnika do chmury w wybranym trybie
function AIBooks:uploadFileForProcessing(filepath, conversionMode)
    local f = io.open(filepath, "rb")
    if not f then
        UIManager:show(InfoMessage:new{ text = _("Nie można otworzyć pliku: ") .. filepath })
        return
    end
    local content = f:read("*all")
    f:close()

    local filename = filepath:match("([^/]+)$") or "book.pdf"
    local modeLabel = conversionMode == "comic_cbz" and _("Format komiksowy (CBZ)")
        or conversionMode == "epub_clean" and _("Lekki EPUB (bez tłumaczenia)")
        or _("Tłumaczenie na polski")

    local info = InfoMessage:new{ text = _("Wysyłanie '") .. filename:sub(1, 25) .. _("' do serwera...\\nTryb: ") .. modeLabel }
    UIManager:show(info)

    self:withNetwork(function()
        local boundary = "----KOReaderFormBoundary" .. os.time()
        local body_start = "--" .. boundary .. "\\r\\n"
            .. "Content-Disposition: form-data; name=\\"file\\"; filename=\\"" .. filename .. "\\"\\r\\n"
            .. "Content-Type: application/octet-stream\\r\\n\\r\\n"
        local body_mode = "\\r\\n--" .. boundary .. "\\r\\n"
            .. "Content-Disposition: form-data; name=\\"conversionMode\\"\\r\\n\\r\\n"
            .. conversionMode
        local body_lang = "\\r\\n--" .. boundary .. "\\r\\n"
            .. "Content-Disposition: form-data; name=\\"targetLang\\"\\r\\n\\r\\n"
            .. (conversionMode == "translate" and "Polish" or "none")
        local body_end = "\\r\\n--" .. boundary .. "--\\r\\n"
        local full_body = body_start .. content .. body_mode .. body_lang .. body_end

        local response_body = {}
        local res, code, headers, status = doHttpRequest{
            url = self.server_url .. "/api/koreader/upload",
            method = "POST",
            headers = {
                ["Content-Type"] = "multipart/form-data; boundary=" .. boundary,
                ["Content-Length"] = tostring(#full_body),
            },
            source = ltn12.source.string(full_body),
            sink = ltn12.sink.table(response_body),
        }

        UIManager:close(info)

        if code == 200 or code == 201 then
            UIManager:show(InfoMessage:new{
                text = _("✅ Plik został pomyślnie przesłany do chmury!\\nSerwer rozpoczął przetwarzanie.\\nSprawdź za chwilę w menu 'Moje zadania'."),
            })
        else
            self:handleHttpError(code, status)
        end
    end)
end

-- Lista aktywnych zadań i pobieranie gotowych plików EPUB / CBZ
-- Lista aktywnych zadań i szybkie zarządzanie e-bookami (zoptymalizowane pod e-ink)
function AIBooks:showTasksList(force_refresh)
    -- Użyj pamięci podręcznej jeśli pobrano w ciągu ostatnich 15 sekund (błyskawiczne otwieranie bez czekania na sieć)
    if not force_refresh and self.cached_tasks and self.cached_tasks_time and (os.time() - self.cached_tasks_time < 15) then
        self:renderTasksMenu(self.cached_tasks)
        return
    end

    local info = InfoMessage:new{ text = _("Pobieranie listy zadań z serwera..."), timeout = 1 }
    UIManager:show(info)

    self:withNetwork(function()
        local response_body = {}
        local res, code, headers, status = doHttpRequest{
            url = self.server_url .. "/api/koreader/tasks",
            method = "GET",
            sink = ltn12.sink.table(response_body),
        }

        UIManager:close(info)

        if code ~= 200 then
            self:handleHttpError(code, status)
            return
        end

        local ok, tasks = pcall(json.decode, table.concat(response_body))
        if not ok or not tasks then
            UIManager:show(InfoMessage:new{ text = _("Błąd odczytu danych z serwera.") })
            return
        end

        self.cached_tasks = tasks
        self.cached_tasks_time = os.time()
        collectgarbage("step", 50)

        self:renderTasksMenu(tasks)
    end)
end

function AIBooks:renderTasksMenu(tasks)
    if not tasks or #tasks == 0 then
        UIManager:show(InfoMessage:new{ text = _("Brak zadań w chmurze.") })
        return
    end

    local items = {
        {
            text = _("🔄 Odśwież zadania z chmury"),
            callback = function() self:showTasksList(true) end,
        },
    }

    for _, t in ipairs(tasks) do
        local formatIcon = (t.outputFormat == "cbz" or (t.outputEpubFilename and t.outputEpubFilename:match("%.cbz$"))) and "🎨 [CBZ] " or "📖 [EPUB] "
        
        -- Sprawdź czy plik jest już fizycznie pobrany na Kindle
        local rawFilename = t.outputEpubFilename or "ksiazka.epub"
        local filename = rawFilename:gsub("[^a-zA-Z0-9._-]", "_")
        local dest_path = self.target_folder .. "/" .. filename
        local local_file = io.open(dest_path, "r")
        local is_local = false
        if local_file then
            local_file:close()
            is_local = true
        end

        local status_str = is_local and "📖 Pobrany na Kindle"
            or t.status == "completed" and "✅ Gotowy do pobrania"
            or t.status == "translating" and ("⏳ Tłumaczenie (" .. (t.progress or 0) .. "%) - " .. (t.currentChapter or 0) .. "/" .. (t.totalChapters or 0))
            or t.status == "extracting" and "📄 Analiza treści..."
            or t.status == "packaging" and "📦 Pakowanie e-booka..."
            or t.status == "failed" and "❌ Błąd"
            or "Oczekuje w kolejce..."

        local label = formatIcon .. t.title .. "\\n[" .. status_str .. "]"

        table.insert(items, {
            text = label,
            callback = function()
                self:showTaskActionMenu(t, is_local, dest_path)
            end,
        })
    end

    table.insert(items, {
        text = _("⚡ Pokaż katalog OPDS (Pobieranie w tle)"),
        callback = function() self:showOpdsInfo() end,
    })

    table.insert(items, {
        text = _("❌ Zamknij / Wróć"),
        callback = function() end,
    })

    local menu = Menu:new{
        title = _("Zadania w chmurze & Biblioteka:"),
        item_table = items,
    }
    UIManager:show(menu)
end

-- Szybkie menu akcji dla konkretnej pozycji
function AIBooks:showTaskActionMenu(task, is_local, dest_path)
    local title = task.title or "Książka"
    local actionItems = {}

    if is_local then
        table.insert(actionItems, {
            text = _("📖 1. Otwórz w czytniku (już pobrany na Kindle!)"),
            callback = function()
                local ok_reader, ReaderUI = pcall(require, "apps/reader/readerui")
                if ok_reader and ReaderUI and ReaderUI.showReader then
                    ReaderUI:showReader(dest_path)
                else
                    local ok_evt, Event = pcall(require, "ui/event")
                    if ok_evt and Event then
                        UIManager:broadcastEvent(Event:new("OpenFile", dest_path))
                    end
                end
            end,
        })
        table.insert(actionItems, {
            text = _("⚡ 2. Otwórz w Katalogu OPDS KOReadera"),
            callback = function() self:openNativeOpds() end,
        })
    elseif task.status == "completed" and task.outputEpubFilename then
        table.insert(actionItems, {
            text = _("⚡ 1. Otwórz w Katalogu OPDS (Pobieranie natywne w tle - bez zacinania)"),
            callback = function() self:openNativeOpds() end,
        })
    else
        table.insert(actionItems, {
            text = _("ℹ️ Status: ") .. (task.status or "w toku") .. " (" .. (task.progress or 0) .. "%)",
            callback = function()
                UIManager:show(InfoMessage:new{
                    text = (task.logs and #task.logs > 0) and task.logs[#task.logs] or "Zadanie jest przetwarzane w chmurze.",
                })
            end,
        })
    end

    -- Opcja usuwania z serwera chmurowego
    table.insert(actionItems, {
        text = _("🗑️ Usuń pozycję z serwera chmurowego"),
        callback = function()
            self:deleteServerTask(task)
        end,
    })

    table.insert(actionItems, {
        text = _("❌ Wróć"),
        callback = function() self:showTasksList(false) end,
    })

    local menu = Menu:new{
        title = title:sub(1, 35),
        item_table = actionItems,
    }
    UIManager:show(menu)
end

-- Usuwanie zadania / książki z serwera
function AIBooks:deleteServerTask(task)
    local confirm = ConfirmBox:new{
        text = _("Czy na pewno chcesz usunąć:\\n'") .. (task.title or "książkę"):sub(1, 30) .. _("'\\nz biblioteki serwera chmurowego?"),
        ok_text = _("Usuń"),
        cancel_text = _("Anuluj"),
        ok_callback = function()
            self:withNetwork(function()
                local response_body = {}
                local res, code, headers, status = doHttpRequest{
                    url = self.server_url .. "/api/koreader/tasks/" .. task.id,
                    method = "DELETE",
                    sink = ltn12.sink.table(response_body),
                }
                if code == 200 then
                    self.cached_tasks = nil
                    UIManager:show(InfoMessage:new{ text = _("✅ Pozycja usunięta z serwera."), timeout = 2 })
                    self:showTasksList(true)
                else
                    self:handleHttpError(code, status)
                end
            end)
        end,
    }
    UIManager:show(confirm)
end

-- Wyświetlanie kodu QR prowadzącego do aplikacji mobilnej w przeglądarce telefonu
function AIBooks:showMobileQRCode()
    local mobile_url = self.server_url .. "/?mobile=1"

    -- 1. Oficjalny natywny widżet QRMessage w KOReaderze (qrencode)
    local ok_qr, QRMessage = pcall(require, "ui/widget/qrmessage")
    if ok_qr and QRMessage then
        local Screen = Device.screen
        local qr_size = math.floor(math.min(Screen:getWidth(), Screen:getHeight()) * 0.70)
        local qr = QRMessage:new{
            text = mobile_url,
            width = qr_size,
            height = qr_size,
        }
        UIManager:show(qr)
        return
    end

    -- 2. Natywny widżet QRWidget
    local ok_qrw, QRWidget = pcall(require, "ui/widget/qrwidget")
    if ok_qrw and QRWidget then
        local Screen = Device.screen
        local qr_size = math.floor(math.min(Screen:getWidth(), Screen:getHeight()) * 0.65)
        local qr = QRWidget:new{
            text = mobile_url,
            width = qr_size,
            height = qr_size,
        }
        local ButtonTable = require("ui/widget/buttontable")
        local dialog
        dialog = Dialog:new{
            title = _("📱 Zeskanuj telefonem"),
            qr,
            buttons = {
                {
                    {
                        text = _("Zamknij"),
                        callback = function() UIManager:close(dialog) end,
                    }
                }
            }
        }
        UIManager:show(dialog)
        return
    end

    -- 3. Czytelny fallback tekstowy z adresem serwera
    local InfoMessage = require("ui/widget/infomessage")
    UIManager:show(InfoMessage:new{
        text = _("📱 Wyszukiwarka książek na telefon:\\n\\n") .. mobile_url .. _("\\n\\nOtwórz ten adres w smartfonie, aby wygodnie wyszukiwać książki i pobierać je na czytnik przez OPDS."),
    })
end

-- Ustawienia adresu serwera z czytelnym opisem i statusem kont
function AIBooks:showSettingsDialog()
    local input
    input = InputDialog:new{
        title = _("⚙️ Ustawienia serwera AI"),
        input = self.server_url,
        input_hint = _("https://ko-zviz.onrender.com"),
        description = _("Adres URL serwera w chmurze:\\n• Konto Chomikuj: diweg68665 (50 MB/tydz)\\n• Mózg AI: Duck.ai + Gemini + Wolny Silnik"),
        buttons = {
            {
                {
                    text = _("Anuluj"),
                    id = "close",
                    callback = function()
                        UIManager:close(input)
                    end,
                },
                {
                    text = _("Zapisz"),
                    is_enter_default = true,
                    callback = function()
                        local val = input:getInputText()
                        UIManager:close(input)
                        if val and val ~= "" then
                            self.server_url = val:gsub("/+$", "")
                            self:saveSettings()
                            UIManager:show(InfoMessage:new{ text = _("Zapisano adres serwera:\\n") .. self.server_url })
                        end
                    end,
                },
            },
        },
    }
    UIManager:show(input)
    if input.onShowKeyboard then input:onShowKeyboard() end
end

return AIBooks
`;
}

/**
 * Creates a zip archive with the complete KOReader plugin directory structure
 */
export async function generatePluginZip(serverUrl: string): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder('aibooks.koplugin');
  if (folder) {
    folder.file('_meta.lua', getMetaLua());
    folder.file('main.lua', getMainLua(serverUrl));
    folder.file(
      'README.txt',
      `KOReader AI Book Cloud Plugin for Kindle 10
Instalacja:
1. Rozpakuj ten folder do: /koreader/plugins/aibooks.koplugin na czytniku Kindle.
2. Zrestartuj KOReadera.
3. W menu glownym (Narzędzia lub Lupka) albo przytrzymując plik PDF/EPUB wybierz "AI Książki, Komiksy i Tłumacz".
`
    );
  }

  const uint8 = await zip.generateAsync({ type: 'uint8array' });
  return Buffer.from(uint8);
}
