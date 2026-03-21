#!/bin/bash

# main.sh - A CLI menu for managing the LocalUI

# --- Configuration ---
CONFIG_DIR="config"
CSS_DIR="public/css"
DEFAULT_PORT="2137"
PHP_LOG_DIR="."
TMP_DIR=".tmp"

# --- Functions ---

# Function to display the main menu
main_menu() {
    clear
    echo "LocalUI Manager"
    echo "---------------"
    echo "1. Start UI"
    echo "2. Stop UI"
    echo "3. Exit"
    echo "---------------"
    read -p "Enter your choice: " choice
    case $choice in
        1) start_ui_menu ;;
        2) stop_ui_menu ;;
        3) exit 0 ;;
        *) echo "Invalid choice. Press Enter to continue."; read -r; main_menu ;;
    esac
}

# Function to display the "Start UI" menu
start_ui_menu() {
    clear
    echo "Start UI"
    echo "--------"

    # 1. Select UI
    echo "Select UI configuration:"
    ui_files=("$CONFIG_DIR"/*.json)
    select ui_file in "${ui_files[@]}"; do
        if [ -n "$ui_file" ]; then
            echo "UI configuration set to $ui_file"
            break
        else
            echo "Invalid selection."
        fi
    done

    # 2. Select Style
    echo -e "
Select stylesheet:"
    css_files=("$CSS_DIR"/*.css)
    select css_file in "${css_files[@]}"; do
        if [ -n "$css_file" ]; then
            echo "Stylesheet set to $css_file"
            break
        else
            echo "Invalid selection."
        fi
    done

    # 3. Enter Port
    read -p "Enter port number (default: $DEFAULT_PORT): " port
    port=${port:-$DEFAULT_PORT}
    
    PHP_LOG="$PHP_LOG_DIR/ui-test-php-$port.log"

    # Create a temporary directory for the session and router
    INSTANCE_DIR="$TMP_DIR/$port"
    mkdir -p "$INSTANCE_DIR/sessions"
    
    ROUTER_SCRIPT="$INSTANCE_DIR/router.php"
    SESSION_DIR="$INSTANCE_DIR/sessions"

    # Remove "public/" from the css_file path
    style_path="/${css_file#public/}"

    # Create the dynamic router script
    cat > "$ROUTER_SCRIPT" <<EOL
<?php
// Dynamically generated router for port $port

// Set the config and style
\$_GET['config'] = '$ui_file';
\$_GET['style'] = '$style_path';

// The request URI
\$uri = \$_SERVER['REQUEST_URI'];

// If the request is for a static file, let the built-in server handle it from the public directory
if (file_exists(__DIR__ . '/../../public' . \$uri) && !is_dir(__DIR__ . '/../../public' . \$uri)) {
    return false;
}

// Route API calls to the api/index.php
if (str_starts_with(\$uri, '/api/')) {
    require_once __DIR__ . '/../../api/index.php';
    return;
}

// For all other requests, include the main index.php file
require_once __DIR__ . '/../../public/index.php';
EOL

    # 4. Start the server
    echo -e "
Starting PHP server on port $port..."
    
    nohup php -S "localhost:$port" -t "public" -d session.save_path="$SESSION_DIR" "$ROUTER_SCRIPT" > "$PHP_LOG" 2>&1 &
    pid=$!

    echo "Server started with PID $pid."
    echo "You can now open http://localhost:$port in your browser."
    echo "Log file: $PHP_LOG"
    echo "Session directory: $SESSION_DIR"
    echo "Press Enter to return to the main menu."
    read -r
    main_menu
}

# Function to display the "Stop UI" menu
stop_ui_menu() {
    clear
    echo "Stop UI"
    echo "-------"
    echo "Select a PHP process to stop:"
    
    mapfile -t pids < <(pgrep -af "php -S localhost")
    
    if [ ${#pids[@]} -eq 0 ]; then
        echo "No running PHP servers found."
    else
        select process_info in "${pids[@]}" "Cancel"; do
            if [ "$process_info" = "Cancel" ]; then
                break
            elif [ -n "$process_info" ]; then
                pid=$(echo "$process_info" | awk '{print $1}')
                kill "$pid"
                echo "Process $pid stopped."
                break
            else
                echo "Invalid selection."
            fi
        done
    fi

    echo "Press Enter to return to the main menu."
    read -r
    main_menu
}

# --- Main Execution ---
# Create the main tmp directory if it doesn't exist
mkdir -p "$TMP_DIR"
main_menu
