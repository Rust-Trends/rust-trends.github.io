# Rust Trends

The premier newsletter and resource for Rust programming trends, tutorials, and ecosystem updates.

**Website:** [rust-trends.com](https://rust-trends.com)

## About

Rust Trends is a biweekly newsletter that keeps you up-to-date with the latest developments in the Rust programming language. The site includes:

- **Newsletter** - 70+ editions covering Rust ecosystem updates, tools, and community news
- **Blog Posts** - In-depth tutorials on topics like building DNS servers, using Clippy, macros, and more
- **Resources** - FAQ, learning materials, and community links

## Tech Stack

- **Static Site Generator:** [Zola](https://www.getzola.org/)
- **Theme:** [Apollo](https://github.com/not-matthias/apollo)
- **Hosting:** GitHub Pages
- **Deployment:** GitHub Actions

## Project Structure

```
├── config.toml          # Zola configuration
├── content/
│   ├── newsletter/      # Newsletter editions (markdown)
│   ├── posts/           # Blog posts (markdown)
│   ├── about.md         # About page
│   ├── faq.md           # FAQ page
│   ├── contact.md       # Contact form
│   └── signup.md        # Newsletter signup
├── templates/           # Jinja2/Tera templates
├── themes/apollo/       # Apollo theme
├── static/              # Static assets (images, JS)
└── snippets/            # Reusable content snippets
```

## Local Development

### Prerequisites

- [Zola](https://www.getzola.org/documentation/getting-started/installation/) (v0.17+)

### Running Locally

```bash
# Clone the repository
git clone https://github.com/Rust-Trends/rust-trends.github.io.git
cd rust-trends.github.io

# Start the development server
zola serve

# Open http://127.0.0.1:1111 in your browser
```

### Building for Production

```bash
zola build
```

The static site will be generated in the `public/` directory.

## Deployment

The site automatically deploys to GitHub Pages when changes are pushed to the `main` branch. The GitHub Actions workflow handles:

1. Building the site with Zola
2. Deploying to the `gh-pages` branch

## Author

**[Bob Peters](https://www.linkedin.com/in/bjhpeters/)** - Creator of Rust Trends

Bob has a strong background in the Internet of Things (IoT) and extensive experience in the technology industry. As an entrepreneur and tech leader, he is passionate about keeping up with the latest trends and advancements. In addition to running Rust Trends, Bob is the CTO of an Industrial IoT company, where he applies his expertise in programming languages and cutting-edge technology.

## Contributing

Contributions are welcome! Feel free to:

- Report issues or suggest improvements
- Submit pull requests for bug fixes or new content
- Share feedback on newsletter editions

## Connect

- [LinkedIn](https://www.linkedin.com/company/rust-trends)
- [GitHub](https://github.com/rust-trends/)
- [Newsletter Signup](https://rust-trends.com/signup/)

## License

Content is copyrighted by Rust Trends. The Apollo theme is used under its respective license.
