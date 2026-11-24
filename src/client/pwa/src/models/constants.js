export const KNOWN_SKILLS = [
    'JavaScript', 'TypeScript', 'Java', 'Python', 'C#', 'C++', '.NET', 'Golang',
    'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'SQL', 'PostgreSQL', 'MySQL',
    'MongoDB', 'Redis', 'Elasticsearch', 'Spring Boot', 'Spring', 'Node.js',
    'Express', 'NestJS', 'React', 'Angular', 'Vue', 'Next.js', 'HTML', 'CSS',
    'Tailwind', 'Sass', 'GraphQL', 'REST', 'gRPC', 'Docker', 'Kubernetes',
    'Terraform', 'Ansible', 'AWS', 'Azure', 'GCP', 'Linux', 'Git', 'CI/CD',
    'GitHub Actions', 'Jenkins', 'Kafka', 'RabbitMQ', 'Microservices',
    'Playwright', 'Selenium', 'Cypress', 'Jest', 'JUnit', 'Figma', 'Jira',
    'Agile', 'Scrum', 'Machine Learning', 'PyTorch', 'TensorFlow', 'LLM',
];

export const AI_MODEL_PRESETS = {
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
    gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-pro'],
    local: ['llama3.2', 'llama3.1', 'qwen2.5:7b', 'mistral', 'gemma3:4b', 'deepseek-r1:8b'],
    local_cosine: ['local-cosine'],
};

export const APPLICATION_STATUSES = ['Applied', 'Screening', 'Interview', 'Offered', 'Rejected'];
