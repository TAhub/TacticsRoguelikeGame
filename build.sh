#!/bin/sh

# Get NPM dependencies for first-time calls.
if [ ! -d "./node_modules" ] ; then
  npm install
fi

# Get the output name.
OUTPUTNAME="out/build.js"

# Make base arguments.
BASEARGUMENTS="-jar compiler.jar"
BASEARGUMENTS+=" --js=debugFlags.js"
BASEARGUMENTS+=" --js='src/main.js'"
for file in src/*js; do
  if [ $file != 'src/main.js' ] ; then
    BASEARGUMENTS+=" --js="
    BASEARGUMENTS+=$file
  fi
done
if [ "$1" = "compiled" ] ; then
  BASEARGUMENTS+=" --define='DEBUG=false'"
  BASEARGUMENTS+="  --compilation_level ADVANCED_OPTIMIZATIONS"
else
  BASEARGUMENTS+=" --define='DEBUG=true'"
  BASEARGUMENTS+=" --js='debug_src/**.js'"
fi;
if [ "$1" = "compiled" ] || [ "$1" = "check" ] ; then
  BASEARGUMENTS+=" --js='extern/**.js'"
fi;
BASEARGUMENTS+=" --warning_level=VERBOSE"
BASEARGUMENTS+=" --language_in=ECMASCRIPT_NEXT"

# Execute the given command.
if [ "$1" = "check" ] ; then
  echo "Testing files..."
  java $BASEARGUMENTS --checks_only
  echo "Running linter..."
  eslint src/* debug_src/* --fix
elif [ "$1" = "uncompiled" ] ; then
  echo "Copying into $OUTPUTNAME in uncompiled mode..."
  rm $OUTPUTNAME
  cat releaseFlags.js >> $OUTPUTNAME;
  cat src/main.js >> $OUTPUTNAME;
  for file in src/*js; do
    if [ $file != 'src/main.js' ] ; then
      cat $file >> $OUTPUTNAME;
    fi
  done
elif [ "$1" = "debug" ] ; then
  echo "Copying into $OUTPUTNAME in uncompiled mode with debug..."
  rm $OUTPUTNAME
  cat debugFlags.js >> $OUTPUTNAME;
  cat src/main.js >> $OUTPUTNAME;
  for file in src/*js; do
    if [ $file != 'src/main.js' ] ; then
      cat $file >> $OUTPUTNAME;
    fi
  done
  for file in debug_src/*js; do cat $file >> $OUTPUTNAME; done
elif [ "$1" = "compiled" ] ; then
  echo "Building into $OUTPUTNAME in compiled mode..."
  java $BASEARGUMENTS --js_output_file "$OUTPUTNAME"
else
  echo "Unknown command '$1'!"
fi;