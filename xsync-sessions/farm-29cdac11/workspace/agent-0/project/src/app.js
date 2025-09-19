// Green Pepper Recipes - Main Application
import { 
    greenPepperRecipes, 
    getRecipesByCategory, 
    getFeaturedRecipes, 
    getQuickRecipes, 
    searchRecipes,
    getAllCategories,
    getRecipeById 
} from './greenPepperRecipes.js';

// State management
let currentRecipes = Object.entries(greenPepperRecipes).map(([id, recipe]) => ({ id, ...recipe }));
let activeFilters = {
    search: '',
    category: '',
    difficulty: '',
    quickOnly: false,
    featuredOnly: false
};

// DOM Elements
const recipesGrid = document.getElementById('recipesGrid');
const recipeCount = document.getElementById('recipeCount');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const difficultyFilter = document.getElementById('difficultyFilter');
const quickRecipesBtn = document.getElementById('quickRecipesBtn');
const featuredBtn = document.getElementById('featuredBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const modal = document.getElementById('recipeModal');
const modalBody = document.getElementById('modalBody');
const closeModal = document.querySelector('.close');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeFilters();
    renderRecipes(currentRecipes);
    setupEventListeners();
});

// Initialize filter options
function initializeFilters() {
    // Populate category filter dynamically
    const categories = getAllCategories();
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
}

// Setup event listeners
function setupEventListeners() {
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    categoryFilter.addEventListener('change', handleCategoryFilter);
    difficultyFilter.addEventListener('change', handleDifficultyFilter);
    quickRecipesBtn.addEventListener('click', handleQuickRecipes);
    featuredBtn.addEventListener('click', handleFeaturedRecipes);
    resetFiltersBtn.addEventListener('click', resetFilters);
    closeModal.addEventListener('click', () => modal.style.display = 'none');
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Filter handlers
function handleSearch(e) {
    activeFilters.search = e.target.value;
    applyFilters();
}

function handleCategoryFilter(e) {
    activeFilters.category = e.target.value;
    applyFilters();
}

function handleDifficultyFilter(e) {
    activeFilters.difficulty = e.target.value;
    applyFilters();
}

function handleQuickRecipes() {
    activeFilters.quickOnly = !activeFilters.quickOnly;
    quickRecipesBtn.classList.toggle('active');
    quickRecipesBtn.style.background = activeFilters.quickOnly ? '#2d5016' : '';
    applyFilters();
}

function handleFeaturedRecipes() {
    activeFilters.featuredOnly = !activeFilters.featuredOnly;
    featuredBtn.classList.toggle('active');
    featuredBtn.style.background = activeFilters.featuredOnly ? '#2d5016' : '';
    applyFilters();
}

function resetFilters() {
    activeFilters = {
        search: '',
        category: '',
        difficulty: '',
        quickOnly: false,
        featuredOnly: false
    };
    
    searchInput.value = '';
    categoryFilter.value = '';
    difficultyFilter.value = '';
    quickRecipesBtn.classList.remove('active');
    featuredBtn.classList.remove('active');
    quickRecipesBtn.style.background = '';
    featuredBtn.style.background = '';
    
    currentRecipes = Object.entries(greenPepperRecipes).map(([id, recipe]) => ({ id, ...recipe }));
    renderRecipes(currentRecipes);
}

// Apply all active filters
function applyFilters() {
    let filtered = Object.entries(greenPepperRecipes).map(([id, recipe]) => ({ id, ...recipe }));
    
    // Search filter
    if (activeFilters.search) {
        filtered = filtered.filter(recipe => {
            const searchLower = activeFilters.search.toLowerCase();
            return recipe.name.toLowerCase().includes(searchLower) ||
                   recipe.ingredients.some(ing => ing.toLowerCase().includes(searchLower)) ||
                   recipe.category.toLowerCase().includes(searchLower);
        });
    }
    
    // Category filter
    if (activeFilters.category) {
        filtered = filtered.filter(recipe => recipe.category === activeFilters.category);
    }
    
    // Difficulty filter
    if (activeFilters.difficulty) {
        filtered = filtered.filter(recipe => recipe.difficulty === activeFilters.difficulty);
    }
    
    // Quick recipes filter
    if (activeFilters.quickOnly) {
        filtered = filtered.filter(recipe => (recipe.prepTime + recipe.cookTime) <= 30);
    }
    
    // Featured filter
    if (activeFilters.featuredOnly) {
        filtered = filtered.filter(recipe => recipe.featured);
    }
    
    currentRecipes = filtered;
    renderRecipes(currentRecipes);
}

// Render recipes to grid
function renderRecipes(recipes) {
    if (recipes.length === 0) {
        recipesGrid.innerHTML = '<div class="no-results">No recipes found matching your criteria. Try adjusting your filters.</div>';
        recipeCount.textContent = 'No recipes found';
        return;
    }
    
    recipeCount.textContent = `Showing ${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}`;
    
    recipesGrid.innerHTML = recipes.map(recipe => `
        <div class="recipe-card" onclick="showRecipeDetail('${recipe.id}')">
            ${recipe.featured ? '<span class="featured-badge">★ Featured</span>' : ''}
            <div class="recipe-header">
                <h2 class="recipe-title">${recipe.name}</h2>
                <span class="recipe-category">${recipe.category}</span>
            </div>
            <div class="recipe-body">
                <div class="recipe-meta">
                    <span class="recipe-time">⏱️ ${recipe.prepTime + recipe.cookTime} min</span>
                    <span class="recipe-difficulty">📊 ${recipe.difficulty}</span>
                    <span class="recipe-servings">👥 ${recipe.servings} servings</span>
                </div>
                <p class="recipe-description">
                    ${recipe.ingredients.slice(0, 3).join(', ')}...
                </p>
                <div class="recipe-nutrition">
                    <div class="nutrition-item">
                        <div class="nutrition-value">${recipe.nutritionPer100g.calories}</div>
                        <div class="nutrition-label">Calories</div>
                    </div>
                    <div class="nutrition-item">
                        <div class="nutrition-value">${recipe.nutritionPer100g.protein}g</div>
                        <div class="nutrition-label">Protein</div>
                    </div>
                    <div class="nutrition-item">
                        <div class="nutrition-value">${recipe.nutritionPer100g.carbs}g</div>
                        <div class="nutrition-label">Carbs</div>
                    </div>
                    <div class="nutrition-item">
                        <div class="nutrition-value">${recipe.nutritionPer100g.fat}g</div>
                        <div class="nutrition-label">Fat</div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Show recipe detail in modal
window.showRecipeDetail = function(recipeId) {
    const recipe = getRecipeById(recipeId);
    if (!recipe) return;
    
    modalBody.innerHTML = `
        <div class="modal-recipe-header">
            <h2 class="modal-recipe-title">${recipe.name}</h2>
            <div class="modal-recipe-meta">
                <span>📁 ${recipe.category}</span>
                <span>⏱️ Prep: ${recipe.prepTime} min</span>
                <span>🔥 Cook: ${recipe.cookTime} min</span>
                <span>📊 ${recipe.difficulty}</span>
                <span>👥 Serves ${recipe.servings}</span>
            </div>
        </div>
        
        <div class="modal-section">
            <h3>Ingredients</h3>
            <ul class="ingredients-list">
                ${recipe.ingredients.map(ing => `<li>${ing}</li>`).join('')}
            </ul>
        </div>
        
        <div class="modal-section">
            <h3>Instructions</h3>
            <ol class="instructions-list">
                ${recipe.instructions.map(inst => `<li>${inst}</li>`).join('')}
            </ol>
        </div>
        
        <div class="modal-section">
            <h3>Nutrition Information (per 100g)</h3>
            <div class="recipe-nutrition">
                <div class="nutrition-item">
                    <div class="nutrition-value">${recipe.nutritionPer100g.calories}</div>
                    <div class="nutrition-label">Calories</div>
                </div>
                <div class="nutrition-item">
                    <div class="nutrition-value">${recipe.nutritionPer100g.protein}g</div>
                    <div class="nutrition-label">Protein</div>
                </div>
                <div class="nutrition-item">
                    <div class="nutrition-value">${recipe.nutritionPer100g.carbs}g</div>
                    <div class="nutrition-label">Carbs</div>
                </div>
                <div class="nutrition-item">
                    <div class="nutrition-value">${recipe.nutritionPer100g.fat}g</div>
                    <div class="nutrition-label">Fat</div>
                </div>
                <div class="nutrition-item">
                    <div class="nutrition-value">${recipe.nutritionPer100g.fiber}g</div>
                    <div class="nutrition-label">Fiber</div>
                </div>
            </div>
        </div>
        
        ${recipe.tips ? `
        <div class="modal-section">
            <h3>Chef's Tips</h3>
            <div class="tips-box">
                ${recipe.tips}
            </div>
        </div>
        ` : ''}
    `;
    
    modal.style.display = 'block';
};

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}