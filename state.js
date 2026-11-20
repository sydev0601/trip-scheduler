const state = {
    trip: {
        title: 'title',
        start: new Date().toLocaleDateString('sv-SE'),
        travelers: 1
    },
    modules: [
        {
            id: 'm1',
            type: 'header',
            props: MODULE.header.default(),
            inline:[],
        },
    ]
}