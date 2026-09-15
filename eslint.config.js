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
                URL: "readonly",
                Blob: "readonly",
                Chart: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly"
            }
        },
        rules: {
            "no-undef": "error"
        }
    }
];