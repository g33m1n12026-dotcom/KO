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

    local res, code, headers, status
    if req.url and req.url:match("^https://") then
        if https then
            res, code, headers, status = https.request(req)
        else
            local ok, ssl_module = pcall(require, "ssl.https")
            if ok and ssl_module then
                res, code, headers, status = ssl_module.request(req)
            else
                res, code, headers, status = http.request(req)
            end
        end
    else
        res, code, headers, status = http.request(req)
    end

    -- Obsluga przekierowan (301, 302, 307, 308)
    if (code == 301 or code == 302 or code == 307 or code == 308) and headers and headers.location and max_redirects > 0 then
        local loc = headers.location
        -- Wykryj Google Cloud Run cookie check blokujacy czytnik
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
    -- Upewnij sie ze folder docelowy na ksiazki i komiksy istnieje
    local lfs = pcall(require, "libs/libkoreader-lfs") and require("libs/libkoreader-lfs") or nil
    if lfs and lfs.mkdir then
        pcall(lfs.mkdir, "/mnt/us/documents")
        pcall(lfs.mkdir, self.target_folder)
    end
end

function AIBooks:loadSettings()
    local settings_path = DataStorage:getSettingsDir() .. "/aibooks_settings.lua"
    local f = io.open(settings_path, "r")
    if f then
        f:close()
        local ok, data = pcall(dofile, settings_path)
        if ok and type(data) == "table" and data.server_url and data.server_url ~= "" then
            -- Ignoruj stare adresy Cloud Run (ais-dev / ais-pre), ktore zwracaly blad 302
            if not data.server_url:match("ais%-dev") and not data.server_url:match("ais%-pre") then
                self.server_url = data.server_url
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
end

-- Obsluga bledu 302 (Google Cloud Run cookie check)
function AIBooks:handleHttpError(code, status_message)
    if code == 302 or status_message == "AUTH_REDIRECT_REQUIRED" then
        local confirm = ConfirmBox:new{
            text = _("Błąd 302: Serwer wymaga autoryzacji Google w przeglądarce.\\n\\nAby czytnik mógł się łączyć bezpośrednio:\\n1. Otwórz aplikację na komputerze/telefonie\\n2. Kliknij 'Włącz Tunel Kindle' (lub użyj Render)\\n3. Wpisz publiczny adres URL w Ustawieniach pluginu.\\n\\nCzy chcesz teraz otworzyć Ustawienia adresu serwera?"),
            ok_text = _("Ustawienia serwera"),
            cancel_text = _("Zamknij"),
            ok_callback = function()
                self:showSettingsDialog()
            end,
        }
        UIManager:show(confirm)
        return
    end

    UIManager:show(InfoMessage:new{
        text = _("Błąd połączenia z serwerem: ") .. tostring(code or "brak odpowiedzi") .. _("\\nSprawdź połączenie Wi-Fi lub adres serwera w Ustawieniach."),
    })
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
    -- 1. Główny wpis w Narzędziach (ikona klucza)
    menu_items.ai_books_main = {
        text = _("📚 AI Książki, Komiksy i Tłumacz"),
        sorting_hint = "tools",
        sub_item_table = {
            {
                text = _("✨ Książka na życzenie (AI Storybook / Poradnik)"),
                callback = function() self:showStorybookDialog() end,
            },
            {
                text = _("📄 Przetłumacz lub konwertuj plik z czytnika (PDF/Komiks/EPUB)"),
                callback = function() self:showLocalFilesDialog() end,
            },
            {
                text = _("💡 Doradca AI: Opisz co chcesz przeczytać"),
                callback = function() self:showRecommendDialog() end,
            },
            {
                text = _("🔍 Szukaj książki w sieci i przetłumacz"),
                callback = function() self:showSearchDialog() end,
            },
            {
                text = _("📥 Moje zadania i pobieranie gotowych plików"),
                callback = function() self:showTasksList() end,
            },
            {
                text = _("⚙️ Ustawienia adresu serwera"),
                callback = function() self:showSettingsDialog() end,
            },
        },
    }

    -- 2. Bezpośrednie skróty pod Lupką (Wyszukiwanie)
    menu_items.ai_books_advisor_quick = {
        text = _("💡 Doradca AI: Dobierz książkę"),
        sorting_hint = "search",
        callback = function() self:showRecommendDialog() end,
    }

    menu_items.ai_books_search_quick = {
        text = _("🔍 Szukaj książki w sieci i przetłumacz"),
        sorting_hint = "search",
        callback = function() self:showSearchDialog() end,
    }

    -- 3. Bezpośredni skrót pod Narzędziami
    menu_items.ai_books_local_convert_quick = {
        text = _("📄 AI: Konwertuj / Przetłumacz plik z czytnika"),
        sorting_hint = "tools",
        callback = function() self:showLocalFilesDialog() end,
    }
end

-- Przeglądarka plików lokalnych w czytniku (/mnt/us/documents)
function AIBooks:showLocalFilesDialog(dir_path)
    dir_path = dir_path or "/mnt/us/documents"
    local lfs = pcall(require, "libs/libkoreader-lfs") and require("libs/libkoreader-lfs") or nil
    local items = {}

    -- Opcja przejscia w gore
    if dir_path ~= "/mnt/us" and dir_path ~= "/mnt/us/documents" then
        local parent = dir_path:match("(.+)/[^/]+$") or "/mnt/us/documents"
        table.insert(items, {
            text = "📁 .. (" .. _("W górę") .. ")",
            callback = function()
                self:showLocalFilesDialog(parent)
            end,
        })
    end

    local ok, entries = pcall(function()
        local list = {}
        if not lfs or not lfs.dir then return list end
        for entry in lfs.dir(dir_path) do
            if entry ~= "." and entry ~= ".." and not entry:match("^%.") then
                local full = dir_path .. "/" .. entry
                local mode = lfs.attributes(full, "mode")
                table.insert(list, { name = entry, path = full, mode = mode })
            end
        end
        table.sort(list, function(a, b)
            if a.mode == "directory" and b.mode ~= "directory" then return true end
            if a.mode ~= "directory" and b.mode == "directory" then return false end
            return a.name:lower() < b.name:lower()
        end)
        return list
    end)

    if not ok or not entries then
        UIManager:show(InfoMessage:new{ text = _("Nie można otworzyć folderu: ") .. dir_path })
        return
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
        input_type = "text",
        description = _("Opisz o czym ma być książka (fabuła powieści, streszczenie dzieła lub poradnik krok po kroku):"),
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
                            self:performStorybookCreation(prompt)
                        end
                    end,
                },
            },
        },
        close_callback = function()
            UIManager:close(input)
        end,
    }
    UIManager:show(input)
end

function AIBooks:performStorybookCreation(promptText)
    local info = InfoMessage:new{ text = _("Zlecanie pisania książki w chmurze AI...") }
    UIManager:show(info)

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
            text = _("✅ Zlecenie przyjęte!\\n\\nAI pisze Twoją książkę rozdział po rozdziale i generuje ryciny.\\n\\nPostęp możesz śledzić w menu 'Moje zadania'. Gdy książka będzie gotowa, pobierzesz ją bezpośrednio do folderu AI_Books na czytniku."),
        })
    else
        self:handleHttpError(code, status)
    end
end

-- Doradca AI na bazie opisu czytelnika
function AIBooks:showRecommendDialog()
    local input
    input = InputDialog:new{
        title = _("Doradca AI: Opisz na co masz ochotę"),
        input_type = "text",
        description = _("Opisz nastrój, motywy lub temat (np. cyberpunk z filozofią, mroczny kryminał noir):"),
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
                            self:performRecommendation(desc)
                        end
                    end,
                },
            },
        },
        close_callback = function()
            UIManager:close(input)
        end,
    }
    UIManager:show(input)
end

function AIBooks:performRecommendation(description)
    local info = InfoMessage:new{ text = _("AI analizuje motywy i dobiera książki w chmurze...") }
    UIManager:show(info)

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
        UIManager:show(InfoMessage:new{ text = _("Brak propozycji dla tego opisu. Spróbuj zmienić słowa kluczowe.") })
        return
    end

    local menu_items = {}
    for _, item in ipairs(data.recommendations) do
        local titleDisplay = item.title
        if item.polishTitle and item.polishTitle ~= "" then
            titleDisplay = item.polishTitle .. " (" .. item.title .. ")"
        end
        local label = titleDisplay .. "\\nAutor: " .. (item.author or "Brak") .. " • " .. (item.genre or "")
        local hint = "💡 " .. (item.matchReason or item.synopsis or "")
        if item.downloadUrl and item.downloadUrl ~= "" then
            hint = "⚡ [Dostępna od ręki] " .. hint
        end
        table.insert(menu_items, {
            text = label .. "\\n" .. hint,
            callback = function()
                if item.downloadUrl and item.downloadUrl ~= "" then
                    self:showBookActionDialog({
                        title = item.polishTitle or item.title,
                        author = item.author or "Nieznany autor",
                        language = item.originalLang or "EN",
                        source = "Repozytorium",
                        downloadUrl = item.downloadUrl,
                    })
                else
                    self:performSearch(item.searchQuery or (item.author .. " " .. item.title))
                end
            end,
        })
    end

    table.insert(menu_items, {
        text = _("❌ Zamknij / Wróć"),
        callback = function() end,
    })

    local menu = Menu:new{
        title = _("Propozycje AI (Wybierz pozycję):"),
        item_table = menu_items,
    }
    UIManager:show(menu)
end

-- Wyszukiwarka książek w Internecie
function AIBooks:showSearchDialog()
    local input
    input = InputDialog:new{
        title = _("Wyszukaj książkę w sieci"),
        input_type = "text",
        description = _("Wpisz tytuł lub autora (np. Frankenstein, Lem, Solaris):"),
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
                            self:performSearch(query)
                        end
                    end,
                },
            },
        },
        close_callback = function()
            UIManager:close(input)
        end,
    }
    UIManager:show(input)
end

function AIBooks:performSearch(query)
    local info = InfoMessage:new{ text = _("Wyszukiwanie książek w chmurze...") }
    UIManager:show(info)

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
        local label = (item.title or "Bez tytułu") .. " (" .. (item.author or "Autor nieznany") .. ")"
        local sub = "[" .. (item.language or "EN") .. "] " .. (item.source or "Sieć")
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
        title = _("Znalezione książki (Wybierz pozycję):"),
        item_table = menu_items,
    }
    UIManager:show(menu)
end

-- Dialog decyzyjny dla wybranej książki
function AIBooks:showBookActionDialog(item)
    local title = item.title or "Książka"
    local author = item.author or "Autor nieznany"

    local menu = Menu:new{
        title = _("Wybór: ") .. title:sub(1, 35),
        item_table = {
            {
                text = _("🌐 1. Przetłumacz na polski i konwertuj do EPUB"),
                callback = function()
                    self:orderBookProcessing(item, "translate")
                end,
            },
            {
                text = _("📖 2. Pobierz w oryginale jako lekki EPUB (bez tłumaczenia)"),
                callback = function()
                    self:orderBookProcessing(item, "epub_clean")
                end,
            },
            {
                text = _("❌ Anuluj"),
                callback = function() end,
            },
        },
    }
    UIManager:show(menu)
end

function AIBooks:orderBookProcessing(item, conversionMode)
    local info = InfoMessage:new{ text = _("Wysyłanie zlecenia do chmury...") }
    UIManager:show(info)

    local payload = json.encode({
        title = item.title,
        downloadUrl = item.downloadUrl,
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
            text = _("Zlecenie przyjęte przez serwer w chmurze!\\nPostęp sprawdzisz w 'Moje zadania'."),
        })
    else
        self:handleHttpError(code, status)
    end
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
            text = _("Plik został pomyślnie przesłany do chmury!\\nSerwer rozpoczął przetwarzanie.\\nSprawdź za chwilę w menu 'Moje zadania'."),
        })
    else
        self:handleHttpError(code, status)
    end
end

-- Lista aktywnych zadań i pobieranie gotowych plików EPUB / CBZ
function AIBooks:showTasksList()
    local info = InfoMessage:new{ text = _("Pobieranie listy zadań z serwera...") }
    UIManager:show(info)

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
    if not ok or not tasks or #tasks == 0 then
        UIManager:show(InfoMessage:new{ text = _("Brak aktywnych zadań w chmurze.") })
        return
    end

    local items = {}
    for _, t in ipairs(tasks) do
        local formatIcon = (t.outputFormat == "cbz" or (t.outputEpubFilename and t.outputEpubFilename:match("%.cbz$"))) and "🎨 [CBZ] " or "📖 [EPUB] "
        local status_str = t.status == "completed" and "✅ Gotowy do pobrania"
            or t.status == "translating" and ("⏳ Tłumaczenie (" .. (t.progress or 0) .. "%) - Rozdz. " .. (t.currentChapter or 0) .. "/" .. (t.totalChapters or 0))
            or t.status == "extracting" and "📄 Analiza PDF..."
            or t.status == "packaging" and "📦 Pakowanie e-booka..."
            or t.status == "failed" and "❌ Błąd"
            or "Oczekuje w kolejce..."

        local label = formatIcon .. t.title .. "\\n[" .. status_str .. "]"

        table.insert(items, {
            text = label,
            callback = function()
                if t.status == "completed" and t.outputEpubFilename then
                    self:downloadCompletedFile(t)
                else
                    UIManager:show(InfoMessage:new{
                        text = _("Zadanie jest w toku: ") .. status_str .. "\\nPostęp: " .. (t.progress or 0) .. "%",
                    })
                end
            end,
        })
    end

    table.insert(items, {
        text = _("❌ Zamknij / Wróć"),
        callback = function() end,
    })

    local menu = Menu:new{
        title = _("Zadania w chmurze (Kliknij gotowy aby pobrać):"),
        item_table = items,
    }
    UIManager:show(menu)
end

-- Pobieranie gotowego pliku EPUB / CBZ prosto do pamięci Kindle
function AIBooks:downloadCompletedFile(task)
    local filename = task.outputEpubFilename or "ksiazka.epub"
    local dest_path = self.target_folder .. "/" .. filename

    local info = InfoMessage:new{ text = _("Pobieranie pliku na czytnik...") }
    UIManager:show(info)

    local f = io.open(dest_path, "wb")
    if not f then
        UIManager:close(info)
        UIManager:show(InfoMessage:new{ text = _("Błąd zapisu w folderze: ") .. dest_path })
        return
    end

    local download_url = self.server_url .. "/api/koreader/download/" .. task.id
    local res, code, headers, status = doHttpRequest{
        url = download_url,
        method = "GET",
        sink = ltn12.sink.file(f),
    }
    f:close()

    UIManager:close(info)

    if code == 200 then
        local confirm = ConfirmBox:new{
            text = _("Plik pobrany pomyślnie!\\nZapisano w: ") .. dest_path .. _("\\n\\nCzy chcesz go otworzyć teraz?"),
            ok_text = _("Otwórz teraz"),
            cancel_text = _("Później"),
            ok_callback = function()
                local ReaderUI = require("apps/reader/readerui")
                if ReaderUI and ReaderUI.showReader then
                    ReaderUI:showReader(dest_path)
                end
            end,
        }
        UIManager:show(confirm)
    else
        self:handleHttpError(code, status)
    end
end

-- Ustawienia adresu serwera z czytelnym opisem
function AIBooks:showSettingsDialog()
    local input
    input = InputDialog:new{
        title = _("Ustawienia serwera AI"),
        input_type = "text",
        input = self.server_url,
        description = _("Adres URL serwera AI w chmurze:\\n(Dla czytnika zalecany jest adres z LocalTunnel / Render)"),
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
        close_callback = function()
            UIManager:close(input)
        end,
    }
    UIManager:show(input)
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
