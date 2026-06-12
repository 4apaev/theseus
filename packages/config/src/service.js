export function bootService(description) {
    console.log(JSON.stringify({
        level  : 'info',
        event  : 'service.booted',
        service: description.service,
        role   : description.role,
        owns   : description.owns,
    }))
}

export function isMain(url) {
    return url === new URL(process.argv[ 1 ], 'file:').href
}
