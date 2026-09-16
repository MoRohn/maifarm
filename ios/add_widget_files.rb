#!/usr/bin/env ruby
# Script to add new widget files to the MaiFarm Xcode project

require 'rubygems'
gem_path = File.expand_path('~/.gem/ruby/2.6.0/gems')
$LOAD_PATH.unshift("#{gem_path}/xcodeproj-1.27.0/lib")
$LOAD_PATH.unshift("#{gem_path}/nanaimo-0.4.0/lib")
$LOAD_PATH.unshift("#{gem_path}/colored2-3.1.2/lib")
$LOAD_PATH.unshift("#{gem_path}/claide-1.1.0/lib")
$LOAD_PATH.unshift("#{gem_path}/atomos-0.1.3/lib")

require 'xcodeproj'

# Open the project
project_path = File.expand_path('../ios/MaiFarm.xcodeproj', __dir__)
project = Xcodeproj::Project.open(project_path)

puts "Opened project: #{project_path}"

# Find targets
widget_target = project.targets.find { |t| t.name == 'MaiFarmWidget' }
app_target = project.targets.find { |t| t.name == 'MaiFarm' }

if widget_target.nil?
  puts "ERROR: Could not find MaiFarmWidget target"
  exit 1
end

if app_target.nil?
  puts "ERROR: Could not find MaiFarm target"
  exit 1
end

puts "Found targets: MaiFarmWidget, MaiFarm"

# Widget files to add
widget_files = [
  'MaiFarmWidget/WidgetSharedModels.swift',
  'MaiFarmWidget/AppGroupFarmStatusStore.swift',
  'MaiFarmWidget/FarmIntents.swift',
  'MaiFarmWidget/MaiFarmOverviewWidget.swift',
  'MaiFarmWidget/MaiFarmFarmMonitorWidget.swift',
  'MaiFarmWidget/MaiFarmHarvestTerminalWidget.swift',
  'MaiFarmWidget/MaiFarmLockScreenWidget.swift',
  'MaiFarmWidget/WidgetPreviews.swift'
]

# App files to add
app_files = [
  'MaiFarm/MaiFarm/Services/WidgetDataSync.swift'
]

# Find or create the MaiFarmWidget group
widget_group = project.main_group.find_subpath('MaiFarmWidget', true)
if widget_group.nil?
  # Try to find it differently
  widget_group = project.groups.find { |g| g.name == 'MaiFarmWidget' || g.path == 'MaiFarmWidget' }
end

if widget_group.nil?
  puts "Creating MaiFarmWidget group..."
  widget_group = project.main_group.new_group('MaiFarmWidget', 'MaiFarmWidget')
end

puts "Widget group: #{widget_group.name}"

# Find or create Services group in MaiFarm
app_group = project.main_group.find_subpath('MaiFarm/MaiFarm/Services', false)
if app_group.nil?
  # Try different paths
  app_group = project.main_group.find_subpath('MaiFarm/Services', false)
end
if app_group.nil?
  # Find MaiFarm group first
  maifarm_group = project.groups.find { |g| g.name == 'MaiFarm' && g.path != 'MaiFarmWidget' }
  if maifarm_group
    services_group = maifarm_group.groups.find { |g| g.name == 'Services' }
    app_group = services_group if services_group
  end
end

puts "Services group found: #{app_group ? 'yes' : 'no'}"

# Helper to check if file already exists in target
def file_in_target?(target, file_path)
  target.source_build_phase.files.any? do |build_file|
    build_file.file_ref && build_file.file_ref.path && build_file.file_ref.real_path.to_s.include?(File.basename(file_path))
  end
end

# Add widget files
puts "\nAdding widget files to MaiFarmWidget target..."
widget_files.each do |file_path|
  full_path = "#{File.expand_path('..', __dir__)}/ios/MaiFarm/#{file_path}"
  file_name = File.basename(file_path)

  unless File.exist?(full_path)
    puts "  SKIP: #{file_name} (file not found at #{full_path})"
    next
  end

  # Check if already in target
  if file_in_target?(widget_target, file_path)
    puts "  SKIP: #{file_name} (already in target)"
    next
  end

  # Check if file reference already exists in group
  existing_ref = widget_group.files.find { |f| f.path == file_name || f.name == file_name }

  if existing_ref
    # Add to build phase if not already there
    widget_target.source_build_phase.add_file_reference(existing_ref)
    puts "  ADDED to build: #{file_name} (reference existed)"
  else
    # Create new file reference and add to build phase
    file_ref = widget_group.new_file(full_path)
    widget_target.source_build_phase.add_file_reference(file_ref)
    puts "  ADDED: #{file_name}"
  end
end

# Add app files
puts "\nAdding app files to MaiFarm target..."
app_files.each do |file_path|
  full_path = "#{File.expand_path('..', __dir__)}/ios/#{file_path}"
  file_name = File.basename(file_path)

  unless File.exist?(full_path)
    puts "  SKIP: #{file_name} (file not found at #{full_path})"
    next
  end

  # Check if already in target
  if file_in_target?(app_target, file_path)
    puts "  SKIP: #{file_name} (already in target)"
    next
  end

  # Find Services group or create reference
  target_group = app_group || project.main_group

  # Check if file reference already exists
  existing_ref = nil
  project.files.each do |f|
    if f.path && f.real_path.to_s.include?(file_name)
      existing_ref = f
      break
    end
  end

  if existing_ref
    app_target.source_build_phase.add_file_reference(existing_ref)
    puts "  ADDED to build: #{file_name} (reference existed)"
  else
    file_ref = target_group.new_file(full_path)
    app_target.source_build_phase.add_file_reference(file_ref)
    puts "  ADDED: #{file_name}"
  end
end

# Save the project
puts "\nSaving project..."
project.save

puts "Done! Files added successfully."
