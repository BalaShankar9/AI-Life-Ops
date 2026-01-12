from setuptools import setup, find_packages

setup(
    name="ai-life-ops-engine",
    version="0.1.0",
    description="AI Life Ops decision engine",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.9",
    install_requires=[
        # All dependencies are standard library
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
        ]
    },
    entry_points={
        "console_scripts": [
            "engine-cli=engine_cli:main",
            "weekly-cli=weekly_cli:main",
        ],
    },
)
