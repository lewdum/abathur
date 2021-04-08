// TODO: loadSettings on change from options page

const storage = browser.storage.sync

async function getOption(name, fallback) {
    const value = (await storage.get(name))[name]
    return value === undefined ? fallback : value
}

browser.browserAction.onClicked.addListener(
    async () => {
        browser.runtime.openOptionsPage()
    }
)

async function main() {
    await loadSettings()

    if (await getOption('firstRun', true)) {
        browser.runtime.openOptionsPage()
        await setOption('firstRun', false)
    }
}

main()
