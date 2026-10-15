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

export function getMainLua(defaultServerUrl: string = process.env.APP_BASE_URL || 'https://ko-kohl.vercel.app'): string {
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
    search_view_mode = "detailed",
}

function AIBooks:init()
    self:onDispatcherRegisterActions()
    if self.ui and self.ui.registerModule then
        self.ui:registerModule("aibooks", self)
    end
    self:loadSettings()
    self:ensureTargetDir()
    self:ensureOpdsCatalog()
end

function AIBooks:onDispatcherRegisterActions()
    local ok_disp, Dispatcher = pcall(require, "dispatcher")
    if ok_disp and Dispatcher and Dispatcher.registerAction then
        Dispatcher:registerAction("aibooks_menu", { category="none", event="ShowAIBooksMenu", title=_("📚 AI Książki"), general=true })
        Dispatcher:registerAction("aibooks_tasks", { category="none", event="ShowAIBooksTasks", title=_("⏳ Zadania w toku"), general=true })
        Dispatcher:registerAction("aibooks_opds", { category="none", event="ShowAIBooksOPDS", title=_("⚡ Katalog OPDS"), general=true })
    end
end


function AIBooks:ensureTargetDir()
    local dir = self.target_folder
    if G_reader_settings and G_reader_settings.readSetting then
        local dl = G_reader_settings:readSetting("download_dir")
        if dl and dl ~= "" then
            dir = dl .. "/AI_Books"
        end
    end

    local check = io.open("/mnt/us/documents", "r")
    if check then
        check:close()
        dir = "/mnt/us/documents/AI_Books"
    else
        local check_sd = io.open("/sdcard/Books", "r") or io.open("/sdcard/Download", "r")
        if check_sd then
            check_sd:close()
            dir = "/sdcard/Books/AI_Books"
        elseif DataStorage and DataStorage.getDataDir then
            dir = DataStorage:getDataDir() .. "/documents/AI_Books"
        end
    end
    self.target_folder = dir
    os.execute('mkdir -p "' .. self.target_folder .. '" 2>/dev/null')
    local ok, lfs = pcall(require, "lfs")
    if ok and lfs and lfs.mkdir then
        pcall(lfs.mkdir, self.target_folder)
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
        if ok and type(data) == "table" then
            if data.server_url and data.server_url ~= "" then
                if not data.server_url:match("ais%-dev") and not data.server_url:match("ais%-pre") then
                    self.server_url = data.server_url:gsub("/+$", "")
                end
            end
            if data.search_view_mode and (data.search_view_mode == "compact" or data.search_view_mode == "detailed") then
                self.search_view_mode = data.search_view_mode
            end
        end
    end
end

function AIBooks:saveSettings()
    local settings_path = DataStorage:getSettingsDir() .. "/aibooks_settings.lua"
    local f = io.open(settings_path, "w")
    if f then
        f:write("return { server_url = [[" .. self.server_url .. "]], search_view_mode = [[" .. (self.search_view_mode or "detailed") .. "]] }\n")
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

-- Książka na życzenie (AI Storybook / Poradnik - jedno proste okno bez zawieszania czytnika)
function AIBooks:showStorybookDialog(prefilled_prompt)
    local input
    input = InputDialog:new{
        title = _("✨ Generuj książkę (AI Storybook)"),
        input_hint = _("np. Cyberpunkowy detektyw w Warszawie 2077"),
        description = _("Opisz fabułę, temat lub bohaterów książki:"),
        input = prefilled_prompt or "",
        buttons = {
            {
                {
                    text = _("Szablony"),
                    callback = function()
                        UIManager:close(input)
                        self:showStorybookPresetsChoice()
                    end,
                },
                {
                    text = _("Anuluj"),
                    id = "close",
                    callback = function()
                        UIManager:close(input)
                    end,
                },
                {
                    text = _("✨ Generuj"),
                    is_enter_default = true,
                    callback = function()
                        local prompt = input:getInputText()
                        UIManager:close(input)
                        if prompt and prompt:gsub("%s+", "") ~= "" then
                            self:withNetwork(function()
                                self:performStorybookCreationFromForm({
                                    prompt = prompt,
                                    type = "story",
                                    chapterCount = 4,
                                    includeIllustrations = true,
                                })
                            end)
                        else
                            UIManager:show(InfoMessage:new{ text = _("Wpisz temat lub fabułę książki!") })
                        end
                    end,
                },
            },
        },
    }
    UIManager:show(input)
    if input.onShowKeyboard then input:onShowKeyboard() end
end


function AIBooks:showStorybookFormDialog()
    local f = self.storybook_form or {
        title = "",
        prompt = "",
        type = "story",
        genre = "Sci-Fi / Przygoda",
        characters = "",
        targetAudience = "Wszyscy (Dla każdego)",
        targetAudienceKey = "all",
        chapterCount = 4,
        includeIllustrations = true,
    }
    self.storybook_form = f

    local promptPreview = (f.prompt and f.prompt ~= "") and (f.prompt:sub(1, 26) .. (f.prompt:len() > 26 and "..." or "")) or _("[Kliknij, aby wpisać]")
    local titlePreview = (f.title and f.title ~= "") and f.title:sub(1, 30) or _("[Automatyczny wg fabuły]")
    local typeLabel = f.type == "story" and "Opowiadanie / Powieść" or f.type == "summary" and "Streszczenie książki" or "Poradnik / Instrukcja"
    local charPreview = (f.characters and f.characters ~= "") and f.characters:sub(1, 26) or _("[Dowolni / wg fabuły]")
    local illuLabel = f.includeIllustrations and "Włączone (Ryciny)" or "Wyłączone"

    local items = {
        {
            text = _("📝 1. Opis fabuły / Temat (wymagane):\\n   ") .. promptPreview,
            callback = function()
                local inp
                inp = InputDialog:new{
                    title = _("Fabuła / Temat książki"),
                    input = f.prompt,
                    input_hint = _("Opisz o czym ma być książka..."),
                    buttons = {
                        {
                            { text = _("Wróć"), callback = function() UIManager:close(inp) end },
                            {
                                text = _("Zapisz"),
                                is_enter_default = true,
                                callback = function()
                                    f.prompt = inp:getInputText() or ""
                                    UIManager:close(inp)
                                    self:showStorybookFormDialog()
                                end,
                            },
                        },
                    },
                }
                UIManager:show(inp)
                if inp.onShowKeyboard then inp:onShowKeyboard() end
            end,
        },
        {
            text = _("📌 2. Tytuł książki:\\n   ") .. titlePreview,
            callback = function()
                local inp
                inp = InputDialog:new{
                    title = _("Tytuł książki"),
                    input = f.title,
                    input_hint = _("Wpisz tytuł lub zostaw puste dla AI..."),
                    buttons = {
                        {
                            { text = _("Wróć"), callback = function() UIManager:close(inp) end },
                            {
                                text = _("Zapisz"),
                                is_enter_default = true,
                                callback = function()
                                    f.title = inp:getInputText() or ""
                                    UIManager:close(inp)
                                    self:showStorybookFormDialog()
                                end,
                            },
                        },
                    },
                }
                UIManager:show(inp)
                if inp.onShowKeyboard then inp:onShowKeyboard() end
            end,
        },
        {
            text = _("🎭 3. Typ książki:\\n   ") .. typeLabel,
            callback = function() self:showStorybookTypeChoice() end,
        },
        {
            text = _("📚 4. Gatunek literacki:\\n   ") .. f.genre,
            callback = function() self:showStorybookGenreChoice() end,
        },
        {
            text = _("👥 5. Główni bohaterowie:\\n   ") .. charPreview,
            callback = function()
                local inp
                inp = InputDialog:new{
                    title = _("Bohaterowie"),
                    input = f.characters,
                    input_hint = _("np. Wiktor (były detektyw), Nova (android)..."),
                    buttons = {
                        {
                            { text = _("Wróć"), callback = function() UIManager:close(inp) end },
                            {
                                text = _("Zapisz"),
                                is_enter_default = true,
                                callback = function()
                                    f.characters = inp:getInputText() or ""
                                    UIManager:close(inp)
                                    self:showStorybookFormDialog()
                                end,
                            },
                        },
                    },
                }
                UIManager:show(inp)
                if inp.onShowKeyboard then inp:onShowKeyboard() end
            end,
        },
        {
            text = _("🎯 6. Grupa odbiorców:\\n   ") .. f.targetAudience,
            callback = function() self:showStorybookAudienceChoice() end,
        },
        {
            text = _("📏 7. Długość / Liczba rozdziałów:\\n   ") .. tostring(f.chapterCount) .. _(" rozdziałów"),
            callback = function() self:showStorybookChaptersChoice() end,
        },
        {
            text = _("🎨 8. Ilustracje AI:\\n   ") .. illuLabel,
            callback = function()
                f.includeIllustrations = not f.includeIllustrations
                self:showStorybookFormDialog()
            end,
        },
        {
            text = _("🚀 9. Gotowe szablony (Cyberpunk, Bajka, itp.)"),
            callback = function() self:showStorybookPresetsChoice() end,
        },
        {
            text = _("✨ ➔ STWÓRZ KSIĄŻKĘ NA ŻYCZENIE"),
            callback = function()
                if not f.prompt or f.prompt:gsub("%s+", "") == "" then
                    UIManager:show(InfoMessage:new{ text = _("⚠️ Wpisz najpierw opis fabuły lub temat książki (Pole 1).") })
                    return
                end
                self:withNetwork(function()
                    self:performStorybookCreationFromForm(f)
                end)
            end,
        },
        {
            text = _("❌ Wróć do menu"),
            callback = function() end,
        },
    }

    local menu = Menu:new{
        title = _("✨ Formularz: Książka na życzenie"),
        item_table = items,
    }
    UIManager:show(menu)
end

function AIBooks:showStorybookTypeChoice()
    local f = self.storybook_form
    local types = {
        { id = "story", text = _("📖 Powieść / Opowiadanie literackie") },
        { id = "summary", text = _("📚 Streszczenie i omówienie lektury/książki") },
        { id = "guide", text = _("🛠️ Poradnik / Przewodnik instruktażowy") },
    }
    local items = {}
    for _, t in ipairs(types) do
        table.insert(items, {
            text = t.text,
            callback = function()
                f.type = t.id
                self:showStorybookFormDialog()
            end,
        })
    end
    UIManager:show(Menu:new{ title = _("Wybierz typ książki:"), item_table = items })
end

function AIBooks:showStorybookGenreChoice()
    local f = self.storybook_form
    local genres = {
        "Sci-Fi / Cyberpunk",
        "Kryminał / Thriller",
        "Fantasy / Magia",
        "Baśń / Bajka dla dzieci",
        "Powieść historyczna",
        "Horror / Groza",
        "Obyczajowa / Romans",
        "Rozwój osobisty / Psychologia",
        "Technologia / Przewodnik",
    }
    local items = {}
    for _, g in ipairs(genres) do
        table.insert(items, {
            text = g,
            callback = function()
                f.genre = g
                self:showStorybookFormDialog()
            end,
        })
    end
    UIManager:show(Menu:new{ title = _("Wybierz gatunek:"), item_table = items })
end

function AIBooks:showStorybookAudienceChoice()
    local f = self.storybook_form
    local audiences = {
        { key = "all", label = "Wszyscy (Dla każdego)" },
        { key = "adults", label = "Dorośli (Głębokie motywy)" },
        { key = "young_adults", label = "Młodzież (Young Adult)" },
        { key = "children", label = "Dzieci (Ciepły i prosty język)" },
    }
    local items = {}
    for _, a in ipairs(audiences) do
        table.insert(items, {
            text = a.label,
            callback = function()
                f.targetAudience = a.label
                f.targetAudienceKey = a.key
                self:showStorybookFormDialog()
            end,
        })
    end
    UIManager:show(Menu:new{ title = _("Grupa docelowa:"), item_table = items })
end

function AIBooks:showStorybookChaptersChoice()
    local f = self.storybook_form
    local chapters = {
        { count = 3, label = "3 rozdziały (Szybkie czytanie / Nowela)" },
        { count = 4, label = "4 rozdziały (Standardowa długość)" },
        { count = 6, label = "6 rozdziałów (Dłuższa wciągająca historia)" },
        { count = 8, label = "8 rozdziałów (Powieść wielowątkowa)" },
        { count = 10, label = "10 rozdziałów (Rozbudowana saga)" },
    }
    local items = {}
    for _, c in ipairs(chapters) do
        table.insert(items, {
            text = c.label,
            callback = function()
                f.chapterCount = c.count
                self:showStorybookFormDialog()
            end,
        })
    end
    UIManager:show(Menu:new{ title = _("Liczba rozdziałów:"), item_table = items })
end

function AIBooks:showStorybookPresetsChoice()
    local f = self.storybook_form
    local presets = {
        {
            label = "🚀 Cyberpunk Noir 'Neonowy Świt'",
            type = "story",
            title = "Neonowy Świt",
            prompt = "Detektyw bada sprawę zaginionego androida o ludzkiej duszy w deszczowej Warszawie roku 2089.",
            genre = "Sci-Fi / Cyberpunk",
            characters = "Wiktor (cyniczny były gliniarz), Nova (model syntetyka)",
            audience = "Dorośli (Głębokie motywy)",
            audienceKey = "adults",
            chapters = 4,
        },
        {
            label = "🦊 Bajka 'Lisek, który policzył gwiazdy'",
            type = "story",
            title = "Lisek, który policzył gwiazdy",
            prompt = "Ciepła i mądra opowieść na dobranoc o małym lisku, który chciał dowiedzieć się, skąd bierze się światło gwiazd.",
            genre = "Baśń / Bajka dla dzieci",
            characters = "Rudy (ciekawy świata lisek), Barnaba (mądra sowa)",
            audience = "Dzieci (Ciepły i prosty język)",
            audienceKey = "children",
            chapters = 3,
        },
        {
            label = "📚 Streszczenie 'Atomowe Nawyki'",
            type = "summary",
            title = "Przewodnik: Atomowe Nawyki",
            prompt = "Wyczerpujące streszczenie i podręcznik wdrażania książki 'Atomic Habits' Jamesa Cleara. Omówienie pętli nawyku, 4 praw zmiany i ćwiczenia.",
            genre = "Rozwój osobisty / Psychologia",
            characters = "",
            audience = "Wszyscy (Dla każdego)",
            audienceKey = "all",
            chapters = 5,
        },
        {
            label = "🛠️ Poradnik 'Sekrety KOReadera'",
            type = "guide",
            title = "Sekrety KOReadera na Kindle",
            prompt = "Praktyczny poradnik konfiguracji, skrótów gestów, czytania nocnego, formatów EPUB i synchronizacji w KOReaderze na Kindle.",
            genre = "Technologia / Przewodnik",
            characters = "",
            audience = "Wszyscy (Dla każdego)",
            audienceKey = "all",
            chapters = 4,
        },
    }

    local items = {}
    for _, p in ipairs(presets) do
        table.insert(items, {
            text = p.label,
            callback = function()
                f.title = p.title
                f.prompt = p.prompt
                f.type = p.type
                f.genre = p.genre
                f.characters = p.characters
                f.targetAudience = p.audience
                f.targetAudienceKey = p.audienceKey
                UIManager:show(InfoMessage:new{ text = _("Wczytano szablon: ") .. p.title, timeout = 1.5 })
                self:showStorybookDialog(p.prompt)
            end,
        })
    end
    UIManager:show(Menu:new{ title = _("Wybierz gotowy szablon:"), item_table = items })
end

function AIBooks:performStorybookCreationFromForm(f)
    local info = InfoMessage:new{ text = _("Zlecanie tworzenia książki w chmurze AI...") }
    UIManager:show(info)

    UIManager:nextTick(function()
        local payload = json.encode({
            title = (f.title and f.title ~= "") and f.title or nil,
            prompt = f.prompt,
            type = f.type or "story",
            genre = f.genre,
            characters = (f.characters and f.characters ~= "") and f.characters or nil,
            targetAudience = f.targetAudienceKey or "all",
            chapterCount = f.chapterCount or 4,
            includeIllustrations = f.includeIllustrations == true,
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
                text = _("✅ Zlecenie przyjęte!\\n\\nAI pisze Twoją książkę rozdział po rozdziale i generuje ilustracje.\\n\\nPostęp możesz śledzić w menu 'Moje zadania'. Po ukończeniu pobierzesz ją bezpośrednio na czytnik lub otworzysz w OPDS."),
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

        self:renderSearchResultsMenu(query, results)
    end)
end

function AIBooks:renderSearchResultsMenu(query, results)
    local isCompact = self.search_view_mode == "compact"
    local menu_items = {
        {
            text = isCompact
                and _("👁️ Widok: Zwięzła lista ➔ [Przełącz na Okienka]")
                or _("👁️ Widok: Okienka/Karty ➔ [Przełącz na Listę]"),
            callback = function()
                self.search_view_mode = isCompact and "detailed" or "compact"
                self:saveSettings()
                self:renderSearchResultsMenu(query, results)
            end,
        },
        {
            text = _("🖼️ Otwórz katalog OPDS z okładkami (płynny tryb Kindle)"),
            callback = function()
                self:openNativeOpds()
            end,
        },
    }

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
        local sourceInfo = item.source or "Sieć"
        local langInfo = (item.language or "PL"):upper()
        local langFlag = langInfo == "PL" and "🇵🇱 [PL]" or (langInfo == "EN" and "🇬🇧 [EN]" or (langInfo == "DE" and "🇩🇪 [DE]" or ("🌐 [" .. langInfo .. "]")))

        -- Bardzo czytelny nagłówek z językiem i formatem na samym początku dla ekranów E-Ink
        local itemText
        if isCompact then
            itemText = langFlag .. " " .. typeTag .. " " .. title:sub(1, 40) .. " • " .. author:sub(1, 22) .. sizeInfo
        else
            local header = langFlag .. " " .. typeTag .. sizeInfo .. " (" .. sourceInfo .. ")"
            local bookLine = title:sub(1, 48)
            local authorLine = "Autor: " .. author:sub(1, 32)
            itemText = header .. "\n📖 " .. bookLine .. "\n👤 " .. authorLine
        end

        table.insert(menu_items, {
            text = itemText,
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
        title = _("Wyniki (") .. #results .. _(" pozycji):"),
        item_table = menu_items,
    }
    UIManager:show(menu)
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
        local isPlExpected = conversionMode == "translate" or item.language == "PL" or (item.originalLang and item.originalLang:upper() == "PL")
        local payload = json.encode({
            title = item.title,
            downloadUrl = dUrl,
            engine = "auto",
            targetLang = isPlExpected and "Polish" or "none",
            conversionMode = conversionMode,
            expectedLang = isPlExpected and "PL" or item.language,
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
            local confirm = ConfirmBox:new{
                text = _("✅ Zlecenie przyjęte przez serwer w chmurze!\\n\\nKsiążka: ") .. (item.title or ""):sub(1, 35) .. _("\\n\\nSerwer pobiera i przygotowuje plik w chmurze.\\nCzy chcesz przejść do 'Zadań w chmurze', aby monitorować postęp i pobrać ją w tle?"),
                ok_text = _("Pokaż zadania"),
                cancel_text = _("Zostań tutaj"),
                ok_callback = function()
                    self:showTasksList(true)
                end,
            }
            UIManager:show(confirm)
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

-- Lista aktywnych zadań i szybkie zarządzanie e-bookami (zoptymalizowane pod e-ink z osobną zakładką na błędy)
function AIBooks:showTasksList(force_refresh, target_tab)
    target_tab = target_tab or "books"
    -- Użyj pamięci podręcznej jeśli pobrano w ciągu ostatnich 15 sekund (błyskawiczne otwieranie bez czekania na sieć)
    if not force_refresh and self.cached_tasks and self.cached_tasks_time and (os.time() - self.cached_tasks_time < 15) then
        self:renderTasksMenu(self.cached_tasks, target_tab)
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

        self:renderTasksMenu(tasks, target_tab)
    end)
end

function AIBooks:renderTasksMenu(tasks, current_tab)
    current_tab = current_tab or "books"
    if not tasks or #tasks == 0 then
        UIManager:show(InfoMessage:new{ text = _("Brak zadań w chmurze.") })
        return
    end

    local bookTasks = {}
    local failedTasks = {}
    for _, t in ipairs(tasks) do
        if t.status == "failed" or (t.error and t.status ~= "completed") then
            table.insert(failedTasks, t)
        else
            table.insert(bookTasks, t)
        end
    end

    if current_tab == "errors" then
        self:renderErrorsSubmenu(tasks, bookTasks, failedTasks)
    else
        self:renderBooksSubmenu(tasks, bookTasks, failedTasks)
    end
end

-- Zakładka 1: Książki w chmurze (czysta lista gotowych książek i zadań w toku - zero błędów)
function AIBooks:renderBooksSubmenu(tasks, bookTasks, failedTasks)
    local items = {
        {
            text = #failedTasks > 0
                and (_("⚠️ Osobna zakładka: Błędy zadań (") .. #failedTasks .. _(") ➔"))
                or _("✅ Błędy zadań: brak (0) ➔"),
            callback = function() self:renderTasksMenu(tasks, "errors") end,
        },
        {
            text = _("🔄 Odśwież zadania z chmury"),
            callback = function() self:showTasksList(true, "books") end,
        },
    }

    if #bookTasks == 0 then
        table.insert(items, {
            text = _("ℹ️ Brak aktywnych książek w chmurze."),
            callback = function() end,
        })
    end

    for _, t in ipairs(bookTasks) do
        local formatIcon = "📖 [EPUB] "
        if t.detailedFormat and t.detailedFormat ~= "" then
            if t.detailedFormat:match("CBZ") or t.detailedFormat:match("Komiks") then
                formatIcon = "🎨 [" .. t.detailedFormat .. "] "
            elseif t.detailedFormat:match("PDF") then
                formatIcon = "📄 [PDF] "
            elseif t.detailedFormat:match("MOBI") then
                formatIcon = "📱 [MOBI] "
            else
                formatIcon = "📖 [" .. t.detailedFormat .. "] "
            end
        elseif t.outputFormat == "cbz" or (t.outputEpubFilename and t.outputEpubFilename:match("%.cbz$")) then
            formatIcon = "🎨 [CBZ] "
        elseif t.outputFormat == "pdf" or (t.outputEpubFilename and t.outputEpubFilename:match("%.pdf$")) then
            formatIcon = "📄 [PDF] "
        end
        
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

        local part_path = dest_path .. ".part"
        local part_file = io.open(part_path, "r")
        local is_downloading = false
        if part_file then
            part_file:close()
            is_downloading = true
        end

        local status_str = is_local and "📖 Pobrany na Kindle"
            or is_downloading and "⏳ Pobieranie w tle..."
            or t.status == "completed" and "✅ Gotowy do pobrania"
            or t.status == "translating" and ("⏳ Tłumaczenie (" .. (t.progress or 0) .. "%) - " .. (t.currentChapter or 0) .. "/" .. (t.totalChapters or 0))
            or t.status == "extracting" and "📄 Analiza treści..."
            or t.status == "packaging" and "📦 Pakowanie e-booka..."
            or "Oczekuje w kolejce..."

        local label = formatIcon .. t.title .. "\n[" .. status_str .. "]"

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
        title = _("📚 Zadania: Książki w chmurze (") .. #bookTasks .. _("):"),
        item_table = items,
    }
    UIManager:show(menu)
end

-- Zakładka 2: Osobna zakładka na błędy i nieudane zadania (oddzielone od książek)
function AIBooks:renderErrorsSubmenu(tasks, bookTasks, failedTasks)
    local items = {
        {
            text = _("📚 ⬅️ Przełącz na: Książki w chmurze (") .. #bookTasks .. _(")"),
            callback = function() self:renderTasksMenu(tasks, "books") end,
        },
        {
            text = _("🔄 Odśwież zadania z chmury"),
            callback = function() self:showTasksList(true, "errors") end,
        },
    }

    if #failedTasks > 0 then
        table.insert(items, {
            text = _("🗑️ Wyczyść wszystkie błędy z serwera (") .. #failedTasks .. _(")"),
            callback = function() self:confirmClearAllFailed(failedTasks) end,
        })

        for _, t in ipairs(failedTasks) do
            local errMsg = t.error or (t.logs and #t.logs > 0 and t.logs[#t.logs]) or "Niepowodzenie przetwarzania"
            errMsg = errMsg:gsub("[\r\n]+", " "):sub(1, 40)
            local label = "❌ " .. (t.title or "Zadanie"):sub(1, 32) .. "\\n[Błąd: " .. errMsg .. "]"

            table.insert(items, {
                text = label,
                callback = function()
                    self:showFailedTaskActionMenu(t)
                end,
            })
        end
    else
        table.insert(items, {
            text = _("✅ Brak błędów! Wszystkie zadania i książki działają poprawnie."),
            callback = function() end,
        })
    end

    table.insert(items, {
        text = _("❌ Zamknij / Wróć"),
        callback = function() end,
    })

    local menu = Menu:new{
        title = _("⚠️ Zadania: Rejestr błędów (") .. #failedTasks .. _("):"),
        item_table = items,
    }
    UIManager:show(menu)
end

-- Czyszczenie wszystkich błędów jednym kliknięciem
function AIBooks:confirmClearAllFailed(failedTasks)
    local confirm = ConfirmBox:new{
        text = _("Czy na pewno chcesz usunąć wszystkie błędy (") .. #failedTasks .. _(") z biblioteki serwera chmurowego?"),
        ok_text = _("Usuń błędy"),
        cancel_text = _("Anuluj"),
        ok_callback = function()
            self:withNetwork(function()
                local response_body = {}
                local res, code = doHttpRequest{
                    url = self.server_url .. "/api/koreader/tasks/clear-failed",
                    method = "POST",
                    headers = { ["Content-Type"] = "application/json" },
                    sink = ltn12.sink.table(response_body),
                }
                self.cached_tasks = nil
                if code == 200 then
                    UIManager:show(InfoMessage:new{ text = _("✅ Wszystkie błędy zostały usunięte z serwera."), timeout = 2 })
                else
                    for _, ft in ipairs(failedTasks) do
                        doHttpRequest{
                            url = self.server_url .. "/api/koreader/tasks/" .. ft.id,
                            method = "DELETE",
                            sink = ltn12.sink.null(),
                        }
                    end
                    UIManager:show(InfoMessage:new{ text = _("✅ Błędy usunięte."), timeout = 2 })
                end
                self:showTasksList(true, "errors")
            end)
        end,
    }
    UIManager:show(confirm)
end

-- Szczegółowe menu pojedynczego błędu z możliwością ponowienia lub usunięcia
function AIBooks:showFailedTaskActionMenu(task)
    local title = task.title or "Zadanie"
    local errMsg = task.error or (task.logs and #task.logs > 0 and task.logs[#task.logs]) or "Wystąpił błąd podczas przetwarzania zadania."
    local actionItems = {
        {
            text = _("📄 Szczegóły błędu:\\n") .. errMsg:sub(1, 90),
            callback = function()
                local logSummary = ""
                if task.logs and #task.logs > 0 then
                    logSummary = "\\n\\nOstatnie komunikaty:\\n" .. table.concat(task.logs, "\\n", math.max(1, #task.logs - 3), #task.logs)
                end
                UIManager:show(InfoMessage:new{
                    text = _("Szczegóły błędu zadania:\\n\\n") .. title .. _("\\n\\nBłąd: ") .. errMsg .. logSummary,
                })
            end,
        },
        {
            text = _("🔄 Spróbuj wznowić zadanie w chmurze"),
            callback = function()
                self:resumeServerTask(task)
            end,
        },
        {
            text = _("🗑️ Usuń ten błąd z serwera"),
            callback = function()
                self:deleteServerTask(task, function()
                    self:showTasksList(true, "errors")
                end)
            end,
        },
        {
            text = _("⬅️ Wróć do zakładki błędów"),
            callback = function()
                self:renderTasksMenu(self.cached_tasks or {}, "errors")
            end,
        },
    }

    local menu = Menu:new{
        title = _("Błąd: ") .. title:sub(1, 30),
        item_table = actionItems,
    }
    UIManager:show(menu)
end

-- Wznawianie zadania z błędem
function AIBooks:resumeServerTask(task)
    local info = InfoMessage:new{ text = _("Wznawianie zadania na serwerze..."), timeout = 1 }
    UIManager:show(info)
    self:withNetwork(function()
        local response_body = {}
        local res, code = doHttpRequest{
            url = self.server_url .. "/api/koreader/tasks/" .. task.id .. "/resume",
            method = "POST",
            headers = { ["Content-Type"] = "application/json" },
            sink = ltn12.sink.table(response_body),
        }
        UIManager:close(info)
        if code == 200 then
            UIManager:show(InfoMessage:new{ text = _("✅ Zadanie wznowione! Przejdź do zakładki 'Książki'.") })
            self:showTasksList(true, "books")
        else
            UIManager:show(InfoMessage:new{ text = _("Nie udało się wznowić: ") .. (table.concat(response_body):sub(1, 80)) })
        end
    end)
end

-- Całkowicie asynchroniczne, nieblokujące pobieranie pliku na czytnik (NIGDY nie zawiesza KOReadera!)
function AIBooks:downloadTaskFileDirectly(task, dest_path)
    self:ensureTargetDir()
    local rawFilename = task.outputEpubFilename or (task.title and (task.title:gsub("[^a-zA-Z0-9._-]", "_") .. ".epub")) or "ksiazka.epub"
    local cleanName = rawFilename:gsub("[^a-zA-Z0-9._-]", "_")
    local actual_dest = dest_path or (self.target_folder .. "/" .. cleanName)
    local part_dest = actual_dest .. ".part"
    local pid_file = actual_dest .. ".pid"
    local stat_file = actual_dest .. ".stat"

    local titleDisplay = (task.title or "książkę"):sub(1, 35)

    -- Szybki nieblokujący toast z krótkim timeoutem (nie blokuje e-inku)
    local info = InfoMessage:new{
        text = _("⚡ Pobieranie w tle rozpoczęte!\\n") .. titleDisplay .. _("\\n\\nMożesz swobodnie korzystać z czytnika — proces pobiera w tle bez zawieszania!"),
        timeout = 3,
    }
    UIManager:show(info)

    self:withNetwork(function()
        local clean_server = (self.server_url or ""):gsub("/+$", "")
        local download_url = clean_server .. "/api/download/" .. task.id

        -- Wyczyść ewentualne stare pliki tymczasowe
        os.remove(part_dest)
        os.remove(pid_file)
        os.remove(stat_file)

        -- Uruchom proces curl/wget w TLE (&), dzięki czemu wątek UI KOReadera wraca NATYCHMIAST (w 3 ms)
        local script = string.format([[sh -c 'echo "RUNNING" > "%s"; if command -v curl >/dev/null 2>&1; then curl -L -k -s -S --connect-timeout 10 -m 300 -H "bypass-tunnel-reminder: 1" -o "%s" "%s"; EC=$?; elif command -v wget >/dev/null 2>&1; then wget -q --no-check-certificate --timeout=15 -t 3 --header="bypass-tunnel-reminder: 1" -O "%s" "%s"; EC=$?; else EC=127; fi; if [ $EC -eq 0 ] && [ -s "%s" ]; then mv -f "%s" "%s"; echo "SUCCESS" > "%s"; else rm -f "%s"; echo "FAILED:$EC" > "%s"; fi' & echo $! > "%s"]],
            stat_file,
            part_dest, download_url,
            part_dest, download_url,
            part_dest,
            part_dest, actual_dest, stat_file,
            part_dest, stat_file,
            pid_file
        )

        os.execute(script)

        -- Asynchroniczny monitor z UIManager:scheduleIn (co sekundę sprawdza stan bez blokowania ekranu)
        local elapsed = 0
        local checkTicker
        checkTicker = function()
            elapsed = elapsed + 1

            local status = "RUNNING"
            local sf = io.open(stat_file, "r")
            if sf then
                status = sf:read("*line") or "RUNNING"
                sf:close()
            end

            -- Sukces: plik pobrany i przeniesiony do folderu docelowego
            if status == "SUCCESS" then
                os.remove(pid_file)
                os.remove(stat_file)

                local final_check = io.open(actual_dest, "rb")
                local final_sz = final_check and final_check:seek("end") or 0
                if final_check then final_check:close() end

                local confirm = ConfirmBox:new{
                    text = _("✅ Książka została pomyślnie pobrana na czytnik!\\n\\nTytuł: ") .. titleDisplay ..
                           _("\\nPlik: ") .. actual_dest ..
                           _("\\nRozmiar: ") .. string.format("%.1f KB", final_sz / 1024) ..
                           _("\\n\\nCzy chcesz otworzyć ją teraz w KOReaderze?"),
                    ok_text = _("Otwórz teraz"),
                    cancel_text = _("Zostaw na potem"),
                    ok_callback = function()
                        local ok_reader, ReaderUI = pcall(require, "apps/reader/readerui")
                        if ok_reader and ReaderUI and ReaderUI.showReader then
                            ReaderUI:showReader(actual_dest)
                        else
                            local ok_evt, Event = pcall(require, "ui/event")
                            if ok_evt and Event then
                                UIManager:broadcastEvent(Event:new("OpenFile", actual_dest))
                            end
                        end
                    end,
                    cancel_callback = function()
                        self:showTasksList(true)
                    end,
                }
                UIManager:show(confirm)
                return
            end

            -- Błąd pobierania (np. brak curl lub błąd sieci)
            if status:match("^FAILED") then
                os.remove(pid_file)
                os.remove(stat_file)
                os.remove(part_dest)

                local confirm_fallback = ConfirmBox:new{
                    text = _("Pobieranie w tle napotkało błąd sieci lub brak narzędzia curl.\\n\\nCzy chcesz otworzyć wbudowany Katalog OPDS KOReadera, który pobiera w tle natywnym menedżerem czytnika?"),
                    ok_text = _("Otwórz OPDS"),
                    cancel_text = _("Zamknij"),
                    ok_callback = function()
                        self:openNativeOpds()
                    end,
                }
                UIManager:show(confirm_fallback)
                return
            end

            -- Sprawdź timeout (np. 5 minut pobierania lub 40 s bez żadnego pobranego bajtu)
            local cur_size = 0
            local pf = io.open(part_dest, "rb")
            if pf then
                cur_size = pf:seek("end") or 0
                pf:close()
            end

            if elapsed > 300 or (elapsed > 40 and cur_size == 0) then
                local pf2 = io.open(pid_file, "r")
                if pf2 then
                    local pid = pf2:read("*line")
                    pf2:close()
                    if pid and pid:match("^%d+$") then
                        os.execute('kill -9 ' .. pid .. ' 2>/dev/null')
                    end
                end
                os.remove(pid_file)
                os.remove(stat_file)
                os.remove(part_dest)

                UIManager:show(InfoMessage:new{
                    text = _("Przekroczono limit czasu pobierania.\\nSprawdź połączenie Wi-Fi na czytniku lub pobierz przez Katalog OPDS."),
                })
                return
            end

            -- Kontynuuj sprawdzanie za 1 sekundę
            UIManager:scheduleIn(1.0, checkTicker)
        end

        -- Pierwsze sprawdzenie za 1 sekundę
        UIManager:scheduleIn(1.0, checkTicker)
    end)
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
            text = _("🔄 2. Pobierz ponownie w tle (zastąp plik)"),
            callback = function()
                self:downloadTaskFileDirectly(task, dest_path)
            end,
        })
        table.insert(actionItems, {
            text = _("⚡ 3. Otwórz w Katalogu OPDS KOReadera"),
            callback = function() self:openNativeOpds() end,
        })
    elseif task.status == "completed" and task.outputEpubFilename then
        table.insert(actionItems, {
            text = _("📥 1. Pobierz w tle na czytnik (Bez zawieszania!)\\n[Pobiera w tle do folderu AI_Books bez zamrażania ekranu]"),
            callback = function()
                self:downloadTaskFileDirectly(task, dest_path)
            end,
        })
        table.insert(actionItems, {
            text = _("⚡ 2. Otwórz w Katalogu OPDS KOReadera\\n[Pobieranie natywne wbudowanym menedżerem]"),
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
            self:deleteServerTask(task, function()
                self:showTasksList(true, "books")
            end)
        end,
    })

    table.insert(actionItems, {
        text = _("❌ Wróć"),
        callback = function() self:renderTasksMenu(self.cached_tasks or {}, "books") end,
    })

    local menu = Menu:new{
        title = title:sub(1, 35),
        item_table = actionItems,
    }
    UIManager:show(menu)
end

-- Usuwanie zadania / książki z serwera
function AIBooks:deleteServerTask(task, onDone)
    local confirm = ConfirmBox:new{
        text = _("Czy na pewno chcesz usunąć:\\n'") .. (task.title or "pozycję"):sub(1, 30) .. _("'\\nz biblioteki serwera chmurowego?"),
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
                    if onDone then
                        onDone()
                    else
                        self:showTasksList(true, "books")
                    end
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
        input_hint = _("https://twoj-serwer.railway.app lub http://192.168.1.X:3000"),
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
    const readmeContent = `======================================================================
  Wtyczka KOReader AI Cloud dla czytnika Kindle 10 (aibooks.koplugin)
======================================================================

Twój serwer w chmurze (Vercel):
• Adres serwera:   ${serverUrl}
• Katalog OPDS:    ${serverUrl}/opds
• Aplikacja WWW:   ${serverUrl}/

----------------------------------------------------------------------
1. INSTALACJA NA CZYTNIKU KINDLE:
----------------------------------------------------------------------
1. Podłącz czytnik Kindle kablem USB do komputera.
2. Skopiuj cały folder "aibooks.koplugin" do katalogu:
   /koreader/plugins/aibooks.koplugin/
   (upewnij się, że pliki main.lua i _meta.lua znajdują się w tym folderze).
3. Bezpiecznie odłącz Kindle i uruchom/zrestartuj KOReadera.
4. W menu KOReadera (ikona Narzędzia/Książki lub Lupka) wybierz:
   "AI Książki, Komiksy i Tłumacz".

----------------------------------------------------------------------
2. KATALOG OPDS (NAJWYGODNIEJSZE POBIERANIE W TLE BEZ ZAWIESZANIA):
----------------------------------------------------------------------
Wtyczka automatycznie rejestruje katalog OPDS w ustawieniach KOReadera!
Możesz go również dodać ręcznie w każdej chwili:
1. W KOReaderze kliknij ikonę wyszukiwania (Lupka).
2. Wybierz "Katalogi OPDS" -> "+" (Dodaj katalog).
3. Wpisz nazwę: "KOReader AI Cloud"
4. Wpisz adres URL: ${serverUrl}/opds
5. Gotowe! Książki dodane w chmurze lub aplikacji pojawią się natychmiast
   i pobiorą się jednym kliknięciem bezpośrednio do pamięci Kindle.

----------------------------------------------------------------------
3. POBIERANIE BEZPOŚREDNIO Z APLIKACJI / TELEFONU:
----------------------------------------------------------------------
• Zeskanuj kod QR aparatem telefonu (w menu wtyczki kliknij "Kod QR")
  lub wejdź na: ${serverUrl}/?mobile=1
• Wyszukaj książkę, kliknij "Pobierz", a plik automatycznie trafi
  do Twojej chmurowej biblioteki i katalogu OPDS czytnika.
• Jeśli czytasz na telefonie, masz do dyspozycji inteligentnego lektora
  z naturalnymi polskimi głosami (Marek / Zofia)!
`;
    folder.file('README.txt', readmeContent);
    folder.file('README.md', readmeContent);
  }

  const uint8 = await zip.generateAsync({ type: 'uint8array' });
  return Buffer.from(uint8);
}
