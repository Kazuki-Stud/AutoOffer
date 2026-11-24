import pluginVue from 'eslint-plugin-vue';

export default [
    { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
    ...pluginVue.configs['flat/recommended'],
    {
        rules: {
            'vue/multi-word-component-names': 'off',
            'vue/max-attributes-per-line': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/html-indent': ['warn', 4],
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
];
