// Healthy Dinners Grocery List Application

class GroceryListApp {
    constructor() {
        this.groceryData = null;
        this.checkedItems = this.loadFromStorage() || {};
        this.init();
    }

    async init() {
        await this.loadGroceryData();
        this.renderGroceryList();
        this.attachEventListeners();
        this.updateProgress();
    }

    async loadGroceryData() {
        try {
            const response = await fetch('data/grocery-data.json');
            this.groceryData = await response.json();
        } catch (error) {
            console.error('Error loading grocery data:', error);
            this.groceryData = this.getDefaultData();
        }
    }

    getDefaultData() {
        return {
            categories: [
                {
                    name: "Quick Start",
                    icon: "🛒",
                    items: [
                        {name: "Chicken breasts", quantity: "2 lbs", notes: "main protein"},
                        {name: "Brown rice", quantity: "1 bag", notes: "whole grain"},
                        {name: "Broccoli", quantity: "2 heads", notes: "vegetables"},
                        {name: "Olive oil", quantity: "1 bottle", notes: "healthy fat"}
                    ]
                }
            ]
        };
    }

    renderGroceryList() {
        const container = document.getElementById('grocery-list');
        if (!container) return;

        let html = '';
        
        // Add progress bar
        html += this.renderProgressBar();
        
        // Add meal ideas section
        if (this.groceryData.mealIdeas) {
            html += this.renderMealIdeas();
        }
        
        // Render categories
        this.groceryData.categories.forEach(category => {
            html += this.renderCategory(category);
        });

        container.innerHTML = html;
        
        // Restore checked states
        this.restoreCheckedStates();
    }

    renderProgressBar() {
        return `
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill" id="progress-fill"></div>
                </div>
                <div class="progress-text" id="progress-text">0% Complete</div>
            </div>
        `;
    }

    renderMealIdeas() {
        const ideas = this.groceryData.mealIdeas;
        const randomIdeas = this.shuffleArray([...ideas]).slice(0, 5);
        
        return `
            <div class="category" style="background: #fff3cd; border-left-color: #ffc107;">
                <h2>
                    <span class="category-icon">💡</span>
                    Meal Ideas for This Week
                </h2>
                <ul style="list-style: none; padding: 0;">
                    ${randomIdeas.map(idea => `
                        <li style="padding: 5px 0; color: #856404;">
                            • ${idea}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    renderCategory(category) {
        return `
            <div class="category">
                <h2>
                    <span class="category-icon">${category.icon}</span>
                    ${category.name}
                </h2>
                <div class="items-grid">
                    ${category.items.map(item => this.renderItem(category.name, item)).join('')}
                </div>
            </div>
        `;
    }

    renderItem(categoryName, item) {
        const itemId = this.getItemId(categoryName, item.name);
        const isChecked = this.checkedItems[itemId] || false;
        
        return `
            <div class="item ${isChecked ? 'checked' : ''}" data-item-id="${itemId}">
                <input type="checkbox" 
                       id="${itemId}" 
                       ${isChecked ? 'checked' : ''}
                       data-category="${categoryName}"
                       data-item="${item.name}">
                <label for="${itemId}">
                    ${item.name}
                    <span class="item-details">(${item.quantity})</span>
                </label>
            </div>
        `;
    }

    getItemId(category, itemName) {
        return `${category}-${itemName}`.replace(/\s+/g, '-').toLowerCase();
    }

    attachEventListeners() {
        // Checkbox listeners
        document.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                this.handleCheckboxChange(e.target);
            }
        });

        // Button listeners
        const printBtn = document.getElementById('print-btn');
        const clearBtn = document.getElementById('clear-btn');
        const saveBtn = document.getElementById('save-btn');

        if (printBtn) printBtn.addEventListener('click', () => this.printList());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAll());
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveList());
    }

    handleCheckboxChange(checkbox) {
        const itemId = checkbox.id;
        const itemDiv = checkbox.closest('.item');
        
        if (checkbox.checked) {
            this.checkedItems[itemId] = true;
            itemDiv.classList.add('checked');
        } else {
            delete this.checkedItems[itemId];
            itemDiv.classList.remove('checked');
        }
        
        this.saveToStorage();
        this.updateProgress();
    }

    updateProgress() {
        const totalItems = document.querySelectorAll('input[type="checkbox"]').length;
        const checkedCount = Object.keys(this.checkedItems).length;
        const percentage = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;
        
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (progressFill) progressFill.style.width = `${percentage}%`;
        if (progressText) progressText.textContent = `${percentage}% Complete (${checkedCount}/${totalItems} items)`;
    }

    restoreCheckedStates() {
        Object.keys(this.checkedItems).forEach(itemId => {
            const checkbox = document.getElementById(itemId);
            if (checkbox) {
                checkbox.checked = true;
                checkbox.closest('.item').classList.add('checked');
            }
        });
    }

    printList() {
        window.print();
    }

    clearAll() {
        if (confirm('Are you sure you want to clear all checked items?')) {
            this.checkedItems = {};
            this.saveToStorage();
            
            document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
                checkbox.closest('.item').classList.remove('checked');
            });
            
            this.updateProgress();
        }
    }

    saveList() {
        const checkedItemsData = this.getCheckedItemsData();
        const dataStr = JSON.stringify(checkedItemsData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `grocery-list-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        alert('Grocery list saved successfully!');
    }

    getCheckedItemsData() {
        const checkedData = {
            date: new Date().toISOString(),
            items: []
        };
        
        Object.keys(this.checkedItems).forEach(itemId => {
            const checkbox = document.getElementById(itemId);
            if (checkbox) {
                checkedData.items.push({
                    category: checkbox.dataset.category,
                    item: checkbox.dataset.item
                });
            }
        });
        
        return checkedData;
    }

    saveToStorage() {
        try {
            localStorage.setItem('groceryCheckedItems', JSON.stringify(this.checkedItems));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem('groceryCheckedItems');
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            return null;
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new GroceryListApp();
});