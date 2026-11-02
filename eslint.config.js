export default [
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                alert: "readonly",
                confirm: "readonly",
                localStorage: "readonly",
                location: "readonly",
                self: "readonly",
                navigator: "readonly",
                FileReader: "readonly",
                URL: "readonly",
                Blob: "readonly",
                Chart: "readonly",
                XLSX: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly"
            }
        },
        rules: {
            "no-undef": "error"
        }
    }
];
